import { z } from "zod";

export type OllamaChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const OllamaChatResponseSchema = z.object({
  message: z.object({
    content: z.string(),
  }),
});

const OllamaChatChunkSchema = z.object({
  message: z
    .object({
      content: z.string(),
    })
    .optional(),
  done: z.boolean().optional(),
  error: z.string().optional(),
});

function createTimeoutSignal(timeoutMs: number, callerSignal?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  function onCallerAbort() {
    ac.abort();
  }
  if (callerSignal) {
    if (callerSignal.aborted) {
      ac.abort();
    } else {
      callerSignal.addEventListener("abort", onCallerAbort, { once: true });
    }
  }

  return {
    signal: ac.signal,
    cleanup: () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    },
  };
}

function wrapAbortError(err: unknown, timeoutMs: number): never {
  if (err instanceof Error && err.name === "AbortError") {
    throw new Error(`Ollama chat timed out after ${timeoutMs}ms`);
  }
  throw err;
}

export async function chatWithOllama(opts: {
  baseUrl: string;
  model: string;
  messages: OllamaChatMessage[];
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const { signal, cleanup } = createTimeoutSignal(timeoutMs, opts.signal);

  try {
    const url = `${opts.baseUrl.replace(/\/$/, "")}/api/chat`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: opts.model, messages: opts.messages, stream: false }),
      signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Ollama chat failed: ${res.status} ${txt}`);
    }
    const json = OllamaChatResponseSchema.parse(await res.json());
    return json.message.content;
  } catch (err: unknown) {
    wrapAbortError(err, timeoutMs);
  } finally {
    cleanup();
  }
}

export async function* chatWithOllamaStream(opts: {
  baseUrl: string;
  model: string;
  messages: OllamaChatMessage[];
  signal?: AbortSignal;
  timeoutMs?: number;
}): AsyncGenerator<string> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const { signal, cleanup } = createTimeoutSignal(timeoutMs, opts.signal);

  try {
    const url = `${opts.baseUrl.replace(/\/$/, "")}/api/chat`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: opts.model, messages: opts.messages, stream: true }),
      signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Ollama chat failed: ${res.status} ${txt}`);
    }
    if (!res.body) return;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      while (true) {
        const nl = buf.indexOf("\n");
        if (nl === -1) break;
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;

        const parsed = OllamaChatChunkSchema.parse(JSON.parse(line));
        if (parsed.error) throw new Error(parsed.error);
        if (parsed.message?.content) yield parsed.message.content;
        if (parsed.done) return;
      }
    }
  } catch (err: unknown) {
    wrapAbortError(err, timeoutMs);
  } finally {
    cleanup();
  }
}
