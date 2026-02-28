import { TranscriptSchema, type Transcript } from "@yt/contracts";
import type pg from "pg";

export async function getLatestTranscriptForVideo(
  client: pg.PoolClient,
  videoId: string,
  opts?: { language?: string }
): Promise<Transcript | null> {
  const language = opts?.language;
  const res = await client.query(
    `
    SELECT
      id::text as id,
      video_id::text as video_id,
      language,
      source,
      is_generated,
      fetched_at::text as fetched_at
    FROM transcripts
    WHERE video_id = $1
      AND ($2::text IS NULL OR language = $2)
    ORDER BY fetched_at DESC
    LIMIT 1
    `,
    [videoId, language ?? null]
  );
  if (res.rowCount === 0) return null;
  return TranscriptSchema.parse(res.rows[0]);
}

export async function listTranscriptsForVideo(client: pg.PoolClient, videoId: string): Promise<Transcript[]> {
  const res = await client.query(
    `
    SELECT
      id::text as id,
      video_id::text as video_id,
      language,
      source,
      is_generated,
      fetched_at::text as fetched_at
    FROM transcripts
    WHERE video_id = $1
    ORDER BY fetched_at DESC
    `,
    [videoId]
  );
  return res.rows.map((r) => TranscriptSchema.parse(r));
}

export async function createTranscriptIfMissing(
  client: pg.PoolClient,
  input: {
    video_id: string;
    language: string;
    source: "official" | "best_effort" | "stt";
    is_generated: boolean;
    provider_payload?: unknown;
  }
): Promise<{ transcript: Transcript; created: boolean }> {
  const existing = await client.query(
    `
    SELECT
      id::text as id,
      video_id::text as video_id,
      language,
      source,
      is_generated,
      fetched_at::text as fetched_at
    FROM transcripts
    WHERE video_id = $1 AND language = $2 AND source = $3
    `,
    [input.video_id, input.language, input.source]
  );
  if ((existing.rowCount ?? 0) > 0) {
    return { transcript: TranscriptSchema.parse(existing.rows[0]), created: false };
  }

  const created = await client.query(
    `
    INSERT INTO transcripts (video_id, language, source, is_generated, provider_payload)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING
      id::text as id,
      video_id::text as video_id,
      language,
      source,
      is_generated,
      fetched_at::text as fetched_at
    `,
    [input.video_id, input.language, input.source, input.is_generated, input.provider_payload ?? null]
  );
  return { transcript: TranscriptSchema.parse(created.rows[0]), created: true };
}
