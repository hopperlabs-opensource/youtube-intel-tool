"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ChatResponse } from "@yt/contracts";
import { ErrorWithRetry } from "@/components/ErrorWithRetry";
import { formatHms } from "@/lib/time";

type Turn = {
  id: string;
  user: string;
  assistant: string;
  traceId: string | null;
  response: ChatResponse | null;
  error: string | null;
};

function parseSseChunk(buf: string): { events: unknown[]; rest: string } {
  const events: unknown[] = [];
  while (true) {
    const sep = buf.indexOf("\n\n");
    if (sep === -1) break;
    const raw = buf.slice(0, sep);
    buf = buf.slice(sep + 2);

    const lines = raw.split("\n");
    const dataLines = lines.filter((l) => l.startsWith("data:"));
    if (dataLines.length === 0) continue;
    const dataStr = dataLines.map((l) => l.slice(5).trimStart()).join("\n");
    try {
      events.push(JSON.parse(dataStr));
    } catch {
      // Ignore non-JSON events.
    }
  }
  return { events, rest: buf };
}

function asObject(v: unknown): Record<string, unknown> | null {
  if (typeof v !== "object" || v === null) return null;
  return v as Record<string, unknown>;
}

export function ChatPanel(props: {
  videoId: string;
  atMs: number;
  onSeekToMs: (ms: number) => void;
  onSelectCueId?: (cueId: string) => void;
}) {
  const [input, setInput] = useState("");
  const [provider, setProvider] = useState<"ollama" | "mock" | "cli">("cli");
  const [modelId, setModelId] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const capsQ = useQuery({
    queryKey: ["capabilities"],
    queryFn: async () => {
      const res = await fetch("/api/capabilities");
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as { embeddings?: { enabled?: boolean } };
    },
    staleTime: 30_000,
  });

  const embeddingsOk = Boolean(capsQ.data?.embeddings?.enabled);

  const lastTurn = useMemo(() => turns[turns.length - 1] ?? null, [turns]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [turns.length, lastTurn?.assistant]);

  async function send(retryMessage?: string) {
    const q = retryMessage ?? input.trim();
    if (!q) return;
    if (isStreaming) return;

    if (!retryMessage) setInput("");
    const turnId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const history = turns
      .filter((t) => !t.error)
      .slice(-8)
      .flatMap((t) =>
        [{ role: "user", content: t.user }].concat(t.assistant ? [{ role: "assistant", content: t.assistant }] : [])
      );

    setTurns((t) => [...t, { id: turnId, user: q, assistant: "", traceId: null, response: null, error: null }]);
    setIsStreaming(true);

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch(`/api/videos/${props.videoId}/chat/stream`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify({
          provider,
          model_id: modelId.trim() ? modelId.trim() : undefined,
          at_ms: props.atMs,
          window_ms: 180_000,
          semantic_k: embeddingsOk ? 6 : 0,
          keyword_k: 6,
          messages: history.concat([{ role: "user", content: q }]),
        }),
        signal: ac.signal,
      });

      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `chat failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const parsed = parseSseChunk(buf);
        buf = parsed.rest;

        for (const ev of parsed.events) {
          const obj = asObject(ev);
          if (!obj) continue;
          const type = obj.type;

          const traceId = obj.trace_id;
          if (type === "meta" && typeof traceId === "string") {
            setTurns((t) => t.map((x) => (x.id === turnId ? { ...x, traceId } : x)));
          }
          if (type === "text" && typeof obj.delta === "string") {
            setTurns((t) =>
              t.map((x) => (x.id === turnId ? { ...x, assistant: x.assistant + obj.delta } : x))
            );
          }
          if (type === "done" && obj.response) {
            setTurns((t) =>
              t.map((x) => (x.id === turnId ? { ...x, response: obj.response as ChatResponse } : x))
            );
          }
          const errObj = asObject(obj.error);
          const errMsg = errObj?.message;
          if (type === "error" && typeof errMsg === "string") {
            setTurns((t) => t.map((x) => (x.id === turnId ? { ...x, error: errMsg } : x)));
          }
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setTurns((t) => t.map((x) => (x.id === turnId ? { ...x, error: msg } : x)));
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="text-sm font-semibold">Chat</div>
        <div className="flex items-center gap-2">
          <select
            className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs"
            value={provider}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "ollama" || v === "mock" || v === "cli") setProvider(v);
            }}
            disabled={isStreaming}
            title="Provider"
          >
            <option value="ollama">Ollama</option>
            <option value="cli">CLI</option>
            <option value="mock">Mock</option>
          </select>
          <input
            className="w-40 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs outline-none focus:border-amber-400"
            placeholder="Model (optional)"
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            disabled={isStreaming || provider === "mock"}
            title={provider === "cli" ? "CLI model id" : "Ollama model id"}
          />
          <div className="text-xs text-zinc-500">t={Math.floor(props.atMs / 1000)}s</div>
          <button
            className="rounded-lg border border-zinc-200 px-2 py-1 text-xs hover:bg-zinc-50 disabled:opacity-60"
            disabled={!isStreaming}
            onClick={() => abortRef.current?.abort()}
            title="Stop streaming"
          >
            Stop
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
        {turns.length === 0 && (
          <div className="text-sm text-zinc-500">
            Ask a question about what&apos;s being said right now, or a concept mentioned in the transcript.
          </div>
        )}

        <div className="flex flex-col gap-3">
          {turns.map((t) => (
            <div key={t.id} className="rounded-xl border border-zinc-200 bg-white p-3">
              <div className="text-xs font-medium text-zinc-500">You</div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-900">{t.user}</div>

              <div className="mt-3 text-xs font-medium text-zinc-500">Assistant</div>
              {t.error && (
                <div className="mt-1">
                  <ErrorWithRetry
                    message={t.error}
                    onRetry={() => {
                      setTurns((prev) => prev.filter((x) => x.id !== t.id));
                      void send(t.user);
                    }}
                    isRetrying={isStreaming}
                  />
                </div>
              )}
              {!t.error && (
                <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-zinc-900">{t.assistant}</div>
              )}

              {t.response && (
                <div className="mt-3 border-t border-zinc-100 pt-3">
                  <div className="text-xs font-medium text-zinc-500">
                    Sources ({t.response.cited_refs.length}/{t.response.sources.length})
                    {t.traceId ? ` · trace ${t.traceId.slice(0, 8)}...` : ""}
                  </div>
                  <div className="mt-2 flex flex-col gap-2">
                    {(t.response.cited_refs.length
                      ? t.response.sources.filter((s) => t.response!.cited_refs.includes(s.ref))
                      : t.response.sources.slice(0, 8)
                    )
                      .slice(0, 12)
                      .map((s) => (
                        <button
                          key={s.ref}
                          className="rounded-lg bg-zinc-50 px-2 py-2 text-left hover:bg-amber-50"
                          onClick={() => {
                            if (s.type === "cue") props.onSelectCueId?.(s.id);
                            props.onSeekToMs(s.start_ms);
                          }}
                          title={s.type === "cue" ? "Seek and select cue" : "Seek to chunk start"}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs font-medium text-zinc-600">
                              {s.ref} · {s.type} · {formatHms(s.start_ms)}
                            </div>
                            {typeof s.score === "number" && (
                              <div className="text-xs tabular-nums text-zinc-500">{s.score.toFixed(2)}</div>
                            )}
                          </div>
                          <div className="mt-1 text-xs leading-5 text-zinc-700">{s.snippet}</div>
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-zinc-200 px-3 py-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-400"
            placeholder="Ask about the transcript..."
            disabled={isStreaming}
          />
          <button
            type="submit"
            className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
            disabled={isStreaming || !input.trim()}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
