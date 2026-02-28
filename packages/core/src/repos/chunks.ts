import type pg from "pg";

export type DbTranscriptChunk = {
  id: string;
  transcript_id: string;
  start_ms: number;
  end_ms: number;
  cue_start_idx: number;
  cue_end_idx: number;
  text: string;
  token_estimate: number | null;
  created_at: string;
};

export async function rebuildChunksForTranscript(
  client: pg.PoolClient,
  transcriptId: string,
  chunks: Array<{
    start_ms: number;
    end_ms: number;
    cue_start_idx: number;
    cue_end_idx: number;
    text: string;
    token_estimate: number;
  }>
): Promise<{ inserted: number }> {
  await client.query(`DELETE FROM transcript_chunks WHERE transcript_id = $1`, [transcriptId]);

  if (chunks.length === 0) return { inserted: 0 };

  const batchSize = 200;
  let inserted = 0;

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const values: any[] = [];
    const params: string[] = [];
    for (let j = 0; j < batch.length; j++) {
      const c = batch[j];
      const base = j * 7;
      values.push(transcriptId, c.start_ms, c.end_ms, c.cue_start_idx, c.cue_end_idx, c.text, c.token_estimate);
      params.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`
      );
    }

    const res = await client.query(
      `
      INSERT INTO transcript_chunks (transcript_id, start_ms, end_ms, cue_start_idx, cue_end_idx, text, token_estimate)
      VALUES ${params.join(",")}
      `,
      values
    );
    inserted += res.rowCount ?? 0;
  }

  return { inserted };
}

export async function listChunksForTranscript(client: pg.PoolClient, transcriptId: string): Promise<DbTranscriptChunk[]> {
  const res = await client.query(
    `
    SELECT
      id::text as id,
      transcript_id::text as transcript_id,
      start_ms,
      end_ms,
      cue_start_idx,
      cue_end_idx,
      text,
      token_estimate,
      created_at::text as created_at
    FROM transcript_chunks
    WHERE transcript_id = $1
    ORDER BY start_ms ASC
    `,
    [transcriptId]
  );
  return res.rows as any;
}

export async function getChunksByIds(client: pg.PoolClient, chunkIds: string[]): Promise<DbTranscriptChunk[]> {
  if (chunkIds.length === 0) return [];
  const res = await client.query(
    `
    SELECT
      id::text as id,
      transcript_id::text as transcript_id,
      start_ms,
      end_ms,
      cue_start_idx,
      cue_end_idx,
      text,
      token_estimate,
      created_at::text as created_at
    FROM transcript_chunks
    WHERE id = ANY($1::uuid[])
    `,
    [chunkIds]
  );
  return res.rows as any;
}
