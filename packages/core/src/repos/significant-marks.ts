import type pg from "pg";
import { SignificantMarkSchema, AutoChapterSchema, type SignificantMark, type AutoChapter, type ChapterSignal } from "@yt/contracts";

// ─── Significant Marks ───────────────────────────────────────────────────────

export async function insertSignificantMarks(
  client: pg.PoolClient,
  videoId: string,
  marks: Array<{
    timestamp_ms: number;
    mark_type: string;
    confidence: number;
    description: string | null;
    metadata_json?: unknown;
    chapter_id?: string | null;
  }>,
): Promise<void> {
  for (const mark of marks) {
    await client.query(
      `INSERT INTO significant_marks
        (video_id, timestamp_ms, mark_type, confidence, description, metadata_json, chapter_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        videoId,
        mark.timestamp_ms,
        mark.mark_type,
        mark.confidence,
        mark.description,
        JSON.stringify(mark.metadata_json ?? {}),
        mark.chapter_id ?? null,
      ],
    );
  }
}

export async function listSignificantMarks(
  client: pg.PoolClient,
  videoId: string,
  opts?: { mark_type?: string; limit?: number },
): Promise<SignificantMark[]> {
  const limit = Math.min(opts?.limit ?? 200, 1000);
  const markType = opts?.mark_type?.trim() || null;

  const res = await client.query(
    `SELECT
       id::text, video_id::text, timestamp_ms, mark_type,
       confidence, description, metadata_json,
       chapter_id::text, created_at::text
     FROM significant_marks
     WHERE video_id = $1
       AND ($2::text IS NULL OR mark_type = $2)
     ORDER BY timestamp_ms ASC
     LIMIT $3`,
    [videoId, markType, limit],
  );
  return res.rows.map((r) => SignificantMarkSchema.parse(r));
}

export async function deleteSignificantMarksForVideo(
  client: pg.PoolClient,
  videoId: string,
): Promise<void> {
  await client.query(`DELETE FROM significant_marks WHERE video_id = $1`, [videoId]);
}

// ─── Auto-Chapters Extension ────────────────────────────────────────────────

export async function replaceAutoChapters(
  client: pg.PoolClient,
  input: {
    video_id: string;
    transcript_id: string | null;
    source: string;
    chapters: Array<{
      start_ms: number;
      end_ms: number;
      title: string;
      signals: ChapterSignal[];
      confidence: number | null;
    }>;
  },
): Promise<void> {
  const source = input.source.trim();

  await client.query(
    `DELETE FROM video_chapters WHERE video_id = $1 AND source = $2`,
    [input.video_id, source],
  );

  for (const ch of input.chapters) {
    const title = ch.title.trim();
    if (!title) continue;

    await client.query(
      `INSERT INTO video_chapters
        (video_id, transcript_id, start_ms, end_ms, title, source, signals, confidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT DO NOTHING`,
      [
        input.video_id,
        input.transcript_id,
        ch.start_ms,
        ch.end_ms,
        title.length > 140 ? title.slice(0, 140) : title,
        source,
        JSON.stringify(ch.signals),
        ch.confidence,
      ],
    );
  }
}

export async function listAutoChapters(
  client: pg.PoolClient,
  videoId: string,
  opts?: { source?: string },
): Promise<AutoChapter[]> {
  const source = opts?.source?.trim() || null;

  const res = await client.query(
    `SELECT
       id::text, video_id::text, transcript_id::text,
       start_ms, end_ms, title, source,
       coalesce(signals, '[]'::jsonb) as signals,
       confidence, created_at::text
     FROM video_chapters
     WHERE video_id = $1
       AND ($2::text IS NULL OR source = $2)
     ORDER BY start_ms ASC
     LIMIT 200`,
    [videoId, source],
  );
  return res.rows.map((r) => AutoChapterSchema.parse(r));
}
