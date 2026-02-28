import type pg from "pg";

function normalizeTag(t: string): string | null {
  const s = t.trim().toLowerCase();
  if (!s) return null;
  // Keep it simple; tags are display/search hints, not identifiers.
  if (s.length > 64) return s.slice(0, 64);
  return s;
}

export async function replaceVideoTags(
  client: pg.PoolClient,
  input: { video_id: string; source: string; tags: string[] }
): Promise<void> {
  const source = input.source.trim();
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const t of input.tags || []) {
    const norm = normalizeTag(String(t));
    if (!norm) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    unique.push(norm);
  }

  // Replace tags for (video, source).
  await client.query(`DELETE FROM video_tags WHERE video_id = $1 AND source = $2`, [input.video_id, source]);
  for (const tag of unique.slice(0, 200)) {
    await client.query(`INSERT INTO video_tags (video_id, tag, source) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [
      input.video_id,
      tag,
      source,
    ]);
  }
}

export async function listVideoTags(
  client: pg.PoolClient,
  videoId: string,
  opts?: { source?: string; limit?: number }
): Promise<string[]> {
  const limit = Math.min(opts?.limit ?? 200, 500);
  const source = opts?.source?.trim() || null;

  const res = await client.query<{ tag: string }>(
    `
    SELECT tag
    FROM video_tags
    WHERE video_id = $1
      AND ($2::text IS NULL OR source = $2)
    ORDER BY tag ASC
    LIMIT $3
    `,
    [videoId, source, limit]
  );
  return res.rows.map((r) => r.tag);
}

