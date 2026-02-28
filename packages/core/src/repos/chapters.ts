import type pg from "pg";
import { VideoChapterSchema, type VideoChapter, type CliChapter } from "@yt/contracts";

function normalizeTitle(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  return t.length > 140 ? t.slice(0, 140) : t;
}

export async function replaceVideoChapters(
  client: pg.PoolClient,
  input: { video_id: string; transcript_id: string; source: string; chapters: CliChapter[] }
): Promise<void> {
  const source = input.source.trim();
  const rows = (input.chapters || [])
    .map((c) => ({
      start_ms: Math.max(0, Math.floor(c.start_ms)),
      end_ms: Math.max(0, Math.floor(c.end_ms)),
      title: normalizeTitle(String(c.title)) ?? null,
    }))
    .filter((c) => c.title)
    .slice(0, 200) as Array<{ start_ms: number; end_ms: number; title: string }>;

  await client.query(`DELETE FROM video_chapters WHERE video_id = $1 AND source = $2`, [input.video_id, source]);
  for (const ch of rows) {
    await client.query(
      `
      INSERT INTO video_chapters (video_id, transcript_id, start_ms, end_ms, title, source)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT DO NOTHING
      `,
      [input.video_id, input.transcript_id, ch.start_ms, ch.end_ms, ch.title, source]
    );
  }
}

export async function listVideoChapters(
  client: pg.PoolClient,
  videoId: string,
  opts?: { source?: string; limit?: number }
): Promise<VideoChapter[]> {
  const limit = Math.min(opts?.limit ?? 200, 500);
  const source = opts?.source?.trim() || null;

  const res = await client.query(
    `
    SELECT
      id::text as id,
      video_id::text as video_id,
      transcript_id::text as transcript_id,
      start_ms,
      end_ms,
      title,
      source,
      created_at::text as created_at
    FROM video_chapters
    WHERE video_id = $1
      AND ($2::text IS NULL OR source = $2)
    ORDER BY start_ms ASC
    LIMIT $3
    `,
    [videoId, source, limit]
  );

  return res.rows.map((r) => VideoChapterSchema.parse(r));
}

