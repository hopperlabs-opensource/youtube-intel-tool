import { z } from "zod";

const OllamaEmbeddingResponseSchema = z.object({
  embedding: z.array(z.number()),
});

export async function embedWithOllama(opts: {
  baseUrl: string;
  model: string;
  prompt: string;
  timeoutMs?: number;
}): Promise<number[]> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const url = `${opts.baseUrl.replace(/\/$/, "")}/api/embeddings`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: opts.model, prompt: opts.prompt }),
      signal: ac.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Ollama embeddings failed: ${res.status} ${txt}`);
    }
    const json = OllamaEmbeddingResponseSchema.parse(await res.json());
    return json.embedding;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Ollama embeddings timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
