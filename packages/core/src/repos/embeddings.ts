import crypto from "crypto";
import type pg from "pg";

export function hashText(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

export async function insertEmbedding(
  client: pg.PoolClient,
  input: {
    transcript_id: string;
    chunk_id: string;
    model_id: string;
    dimensions: number;
    embedding: number[];
    text_hash: string;
  }
): Promise<void> {
  // NOTE: embeddings.embedding is vector(768); this will fail if the dimensions don't match.
  const v = `[${input.embedding.join(",")}]`;
  await client.query(
    `
    INSERT INTO embeddings (transcript_id, chunk_id, model_id, dimensions, embedding, text_hash)
    VALUES ($1, $2, $3, $4, $5::vector, $6)
    ON CONFLICT (chunk_id, model_id) DO NOTHING
    `,
    [input.transcript_id, input.chunk_id, input.model_id, input.dimensions, v, input.text_hash]
  );
}

export async function countEmbeddingsForTranscript(
  client: pg.PoolClient,
  transcriptId: string,
  modelId: string
): Promise<number> {
  const res = await client.query<{ n: string }>(
    `SELECT count(*)::text as n FROM embeddings WHERE transcript_id = $1 AND model_id = $2`,
    [transcriptId, modelId]
  );
  return Number(res.rows[0]?.n || 0);
}
