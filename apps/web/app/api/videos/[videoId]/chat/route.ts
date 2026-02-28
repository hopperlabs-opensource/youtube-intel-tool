import { NextResponse } from "next/server";
import {
  buildRagForVideoChat,
  chatWithOllama,
  createChatTurn,
  extractCitedRefsFromAnswer,
  finishChatTurn,
  getPool,
  getYitDefault,
  initMetrics,
  runClaudeCliText,
  runCodexCliText,
  runGeminiCliText,
} from "@yt/core";
import { ChatRequestSchema, ChatResponseSchema } from "@yt/contracts";
import { jsonError } from "@/lib/server/api";
import { getEmbeddingsEnvForRequest } from "@/lib/server/openai_key";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ videoId: string }> }) {
  const metrics = initMetrics();
  const startedAt = Date.now();
  const trace_id = randomUUID();

  let chatTurnId: string | null = null;
  let provider = "unknown";

  try {
    const { videoId } = await ctx.params;
    const body = ChatRequestSchema.parse(await req.json().catch(() => ({})));
    const embedEnv = getEmbeddingsEnvForRequest(req);
    provider = body.provider;

    const lastUser = [...body.messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return jsonError("invalid_request", "messages must include at least one user message", { status: 400 });

    const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || getYitDefault("OLLAMA_BASE_URL");
    const cliModel =
      body.provider === "cli" ? (body.model_id ?? process.env.YIT_CHAT_CLI_MODEL ?? undefined) : undefined;
    const model_id =
      body.provider === "cli"
        ? cliModel ?? "default"
        : body.model_id ?? (body.provider === "ollama" ? process.env.OLLAMA_CHAT_MODEL ?? "llama3.1" : "mock");

    const pool = getPool();

    const rag = await (async () => {
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

    const messages = [
      { role: "system" as const, content: rag.system_prompt },
      ...body.messages.filter((m) => m.role !== "system").slice(-20),
    ];

    let answer = "";
    if (body.provider === "mock") {
      answer = `Mock response.\n\nQuestion: ${lastUser.content}\n\nSources available: ${rag.sources.length}`;
    } else if (body.provider === "ollama") {
      answer = await chatWithOllama({
        baseUrl: ollamaBaseUrl,
        model: model_id,
        messages,
        signal: req.signal,
      });
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
      const resp =
        cliProvider === "claude"
          ? await runClaudeCliText({ prompt: `${sys}\n\nCONVERSATION:\n${convo}`, model: cliModel, timeoutMs })
          : cliProvider === "codex"
            ? await runCodexCliText({ prompt: `${sys}\n\nCONVERSATION:\n${convo}`, model: cliModel, timeoutMs })
          : await runGeminiCliText({ prompt: sys, input: convo, model: cliModel, timeoutMs });

      answer = resp.text;
    } else {
      return jsonError("unsupported_provider", `provider '${body.provider}' not supported yet`, { status: 400 });
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
    metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/chat", method: "POST", status: "200" });

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

    return NextResponse.json(response, { headers: { "x-trace-id": trace_id } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - startedAt;
    metrics.chatRequestsTotal.inc({ provider, status: "failed" });
    metrics.chatDurationMs.observe({ provider, status: "failed" }, durationMs);
    metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/chat", method: "POST", status: "400" });

    // Best-effort failure writeback for provenance.
    if (chatTurnId) {
      try {
        const pool = getPool();
        const client = await pool.connect();
        try {
          await finishChatTurn(client, {
            id: chatTurnId,
            status: "failed",
            response_text: null,
            response_json: null,
            error: msg,
            duration_ms: durationMs,
          });
        } finally {
          client.release();
        }
      } catch {}
    }

    return jsonError("chat_failed", msg, { status: 400 });
  }
}
