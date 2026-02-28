import { TranscriptCueSchema, type TranscriptCue } from "@yt/contracts";
import type pg from "pg";

export async function listCuesByTranscript(
  client: pg.PoolClient,
  transcriptId: string,
  opts?: { cursorIdx?: number; limit?: number }
): Promise<{ cues: TranscriptCue[]; next_cursor: number | null }> {
  const cursorIdx = opts?.cursorIdx ?? 0;
  const limit = Math.min(opts?.limit ?? 5000, 5000);
  const res = await client.query(
    `
    SELECT
      c.id::text as id,
      c.transcript_id::text as transcript_id,
      c.idx,
      c.start_ms,
      c.end_ms,
      c.text,
      cs.speaker_id::text as speaker_id
    FROM transcript_cues c
    LEFT JOIN cue_speakers cs ON cs.cue_id = c.id
    WHERE c.transcript_id = $1
      AND c.idx >= $2
    ORDER BY c.idx ASC
    LIMIT $3
    `,
    [transcriptId, cursorIdx, limit + 1]
  );

  const rows = res.rows.map((r) => TranscriptCueSchema.parse(r));
  const hasMore = rows.length > limit;
  const cues = hasMore ? rows.slice(0, -1) : rows;
  const next_cursor = hasMore ? cues[cues.length - 1].idx + 1 : null;
  return { cues, next_cursor };
}

export async function insertCues(
  client: pg.PoolClient,
  input: {
    video_id: string;
    transcript_id: string;
    cues: Array<{ idx: number; start_ms: number; end_ms: number; text: string; norm_text: string }>;
  }
): Promise<void> {
  // Insert in a single multi-values statement in batches to avoid giant queries.
  const batchSize = 500;
  for (let i = 0; i < input.cues.length; i += batchSize) {
    const batch = input.cues.slice(i, i + batchSize);
    const values: any[] = [];
    const params: string[] = [];
    for (let j = 0; j < batch.length; j++) {
      const c = batch[j];
      const base = j * 7;
      // (video_id, transcript_id, idx, start_ms, end_ms, text, norm_text)
      values.push(input.video_id, input.transcript_id, c.idx, c.start_ms, c.end_ms, c.text, c.norm_text);
      params.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`
      );
    }
    await client.query(
      `
      INSERT INTO transcript_cues (id, transcript_id, idx, start_ms, end_ms, text, norm_text)
      SELECT gen_random_uuid(), v.transcript_id::uuid, v.idx::int, v.start_ms::int, v.end_ms::int, v.text::text, v.norm_text::text
      FROM (VALUES ${params.join(",")})
        AS v(video_id, transcript_id, idx, start_ms, end_ms, text, norm_text)
      ON CONFLICT (transcript_id, idx) DO NOTHING
      `,
      values
    );
  }
}

export async function listCuesInWindow(
  client: pg.PoolClient,
  transcriptId: string,
  opts: { start_ms: number; end_ms: number; limit?: number }
): Promise<TranscriptCue[]> {
  const limit = Math.min(opts.limit ?? 800, 2000);
  const res = await client.query(
    `
    SELECT
      id::text as id,
      transcript_id::text as transcript_id,
      idx,
      start_ms,
      end_ms,
      text
    FROM transcript_cues
    WHERE transcript_id = $1
      AND start_ms <= $3
      AND end_ms >= $2
    ORDER BY start_ms ASC
    LIMIT $4
    `,
    [transcriptId, opts.start_ms, opts.end_ms, limit]
  );
  return res.rows.map((r) => TranscriptCueSchema.parse(r));
}
