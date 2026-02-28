import {
  buildRagForVideoChat,
  chatWithOllamaStream,
  createChatTurn,
  extractCitedRefsFromAnswer,
  finishChatTurn,
  getPool,
  initMetrics,
  runClaudeCliText,
  runCodexCliText,
  runGeminiCliTextStream,
} from "@yt/core";
import { ChatRequestSchema, ChatResponseSchema } from "@yt/contracts";
import { randomUUID } from "crypto";
import { getEmbeddingsEnvForRequest } from "@/lib/server/openai_key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sseEncode(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

export async function POST(req: Request, ctx: { params: Promise<{ videoId: string }> }) {
  const metrics = initMetrics();
  const startedAt = Date.now();
  const trace_id = randomUUID();

  const { videoId } = await ctx.params;
  const embedEnv = getEmbeddingsEnvForRequest(req);
  let body: ReturnType<typeof ChatRequestSchema.parse>;
  try {
    body = ChatRequestSchema.parse(await req.json().catch(() => ({})));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(sseEncode({ type: "error", error: { code: "invalid_request", message: msg } }), {
      status: 400,
      headers: { "content-type": "text/event-stream", "x-trace-id": trace_id },
    });
  }

  const lastUser = [...body.messages].reverse().find((m) => m.role === "user");
  if (!lastUser) {
    return new Response(sseEncode({ type: "error", error: { code: "invalid_request", message: "missing user message" } }), {
      status: 400,
      headers: { "content-type": "text/event-stream", "x-trace-id": trace_id },
    });
  }

  const pool = getPool();
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
  const cliModel =
    body.provider === "cli" ? (body.model_id ?? process.env.YIT_CHAT_CLI_MODEL ?? undefined) : undefined;
  const model_id =
    body.provider === "cli"
      ? cliModel ?? "default"
      : body.model_id ?? (body.provider === "ollama" ? process.env.OLLAMA_CHAT_MODEL ?? "llama3.1" : "mock");

  let chatTurnId: string | null = null;
  let rag: Awaited<ReturnType<typeof buildRagForVideoChat>>;
  try {
    rag = await (async () => {
      const client = await pool.connect();
      try {
        const r = await buildRagForVideoChat(client, {
          videoId,
          at_ms: body.at_ms,
          language: body.language,
          query: lastUser.content,
          window_ms: body.window_ms,
          semantic_k: body.semantic_k,
          keyword_k: body.keyword_k,
          embedding_env: embedEnv,
        });

        const created = await createChatTurn(client, {
          video_id: videoId,
          transcript_id: r.transcript_id,
          trace_id,
          provider: body.provider,
          model_id,
          at_ms: body.at_ms,
          request_json: body,
          retrieval_json: { ...r.retrieval, sources_count: r.sources.length },
        });
        chatTurnId = created.id;
        return r;
      } finally {
        client.release();
      }
    })();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(sseEncode({ type: "error", error: { code: "chat_failed", message: msg } }), {
      status: 400,
      headers: { "content-type": "text/event-stream", "x-trace-id": trace_id },
    });
  }

  const stream = new ReadableStream({
    start: async (controller) => {
      const enc = new TextEncoder();
      controller.enqueue(enc.encode(sseEncode({ type: "meta", trace_id })));

      const messages = [
        { role: "system" as const, content: rag.system_prompt },
        ...body.messages.filter((m) => m.role !== "system").slice(-20),
      ];

      let answer = "";
      try {
        if (body.provider === "mock") {
          const txt = `Mock response.\n\nQuestion: ${lastUser.content}\n\nSources available: ${rag.sources.length}`;
          answer = txt;
          controller.enqueue(enc.encode(sseEncode({ type: "text", delta: txt })));
        } else if (body.provider === "ollama") {
          for await (const delta of chatWithOllamaStream({
            baseUrl: ollamaBaseUrl,
            model: model_id,
            messages,
            signal: req.signal,
          })) {
            answer += delta;
            controller.enqueue(enc.encode(sseEncode({ type: "text", delta })));
          }
        } else if (body.provider === "cli") {
          const cliProvider = (process.env.YIT_CHAT_CLI_PROVIDER || "gemini").trim().toLowerCase();
          const timeoutMs = (() => {
            const raw = (process.env.YIT_CHAT_CLI_TIMEOUT_MS || "").trim();
            if (!raw) return 180_000;
            const n = Number(raw);
            return Number.isFinite(n) ? Math.max(1000, Math.floor(n)) : 180_000;
          })();

          const convo = messages
            .filter((m) => m.role !== "system")
            .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
            .join("\n\n");

          const sys = `${rag.system_prompt}\n\nReturn ONLY the assistant answer text.`;
          if (cliProvider === "claude") {
            const resp = await runClaudeCliText({ prompt: `${sys}\n\nCONVERSATION:\n${convo}`, model: cliModel, timeoutMs });
            answer = resp.text;
            const chunkSize = 400;
            for (let i = 0; i < answer.length; i += chunkSize) {
              const delta = answer.slice(i, i + chunkSize);
              controller.enqueue(enc.encode(sseEncode({ type: "text", delta })));
            }
          } else if (cliProvider === "codex") {
            const resp = await runCodexCliText({ prompt: `${sys}\n\nCONVERSATION:\n${convo}`, model: cliModel, timeoutMs });
            answer = resp.text;
            const chunkSize = 400;
            for (let i = 0; i < answer.length; i += chunkSize) {
              const delta = answer.slice(i, i + chunkSize);
              controller.enqueue(enc.encode(sseEncode({ type: "text", delta })));
            }
          } else {
            // Gemini: stream deltas live when possible.
            const resp = await runGeminiCliTextStream({
              prompt: sys,
              input: convo,
              model: cliModel,
              timeoutMs,
              onDelta: (delta) => {
                answer += delta;
                controller.enqueue(enc.encode(sseEncode({ type: "text", delta })));
              },
            });

            // Prefer the accumulated streamed text to match what the client saw.
            // (resp.text is currently the same, but keep this defensively.)
            if (resp.text && resp.text.length >= answer.length) answer = resp.text;
          }
        } else {
          throw new Error(`provider '${body.provider}' not supported yet`);
        }

        const cited_refs = extractCitedRefsFromAnswer(answer);
        const response = ChatResponseSchema.parse({
          trace_id,
          answer,
          sources: rag.sources,
          cited_refs,
          retrieval: rag.retrieval,
        });

        const durationMs = Date.now() - startedAt;
        metrics.chatRequestsTotal.inc({ provider: body.provider, status: "completed" });
        metrics.chatDurationMs.observe({ provider: body.provider, status: "completed" }, durationMs);
        metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/chat/stream", method: "POST", status: "200" });

        if (chatTurnId) {
          const client2 = await pool.connect();
          try {
            await finishChatTurn(client2, {
              id: chatTurnId,
              status: "completed",
              response_text: answer,
              response_json: response,
              error: null,
              duration_ms: durationMs,
            });
          } finally {
            client2.release();
          }
        }

        controller.enqueue(enc.encode(sseEncode({ type: "done", response })));
        controller.close();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const durationMs = Date.now() - startedAt;
        metrics.chatRequestsTotal.inc({ provider: body.provider, status: "failed" });
        metrics.chatDurationMs.observe({ provider: body.provider, status: "failed" }, durationMs);
        metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/chat/stream", method: "POST", status: "400" });

        if (chatTurnId) {
          try {
            const client2 = await pool.connect();
            try {
              await finishChatTurn(client2, {
                id: chatTurnId,
                status: "failed",
                response_text: null,
                response_json: null,
                error: msg,
                duration_ms: durationMs,
              });
            } finally {
              client2.release();
            }
          } catch {}
        }

        controller.enqueue(enc.encode(sseEncode({ type: "error", error: { code: "chat_failed", message: msg } })));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-trace-id": trace_id,
    },
  });
}
