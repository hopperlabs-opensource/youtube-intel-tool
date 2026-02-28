import { z } from "zod";

const OpenAIEmbeddingResponseSchema = z.object({
  data: z.array(
    z.object({
      embedding: z.array(z.number()),
    })
  ),
});

export async function embedWithOpenAI(opts: {
  apiKey: string;
  model: string;
  input: string;
  dimensions?: number;
  baseUrl?: string;
}): Promise<number[]> {
  const baseUrl = (opts.baseUrl || "https://api.openai.com").replace(/\/$/, "");
  const url = `${baseUrl}/v1/embeddings`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${opts.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      input: opts.input,
      ...(typeof opts.dimensions === "number" ? { dimensions: opts.dimensions } : null),
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`OpenAI embeddings failed: ${res.status} ${txt}`);
  }

  const json = OpenAIEmbeddingResponseSchema.parse(await res.json());
  const emb = json.data[0]?.embedding;
  if (!emb || !emb.length) throw new Error("OpenAI embeddings missing embedding vector");
  return emb;
}

