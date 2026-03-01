import type pg from "pg";
import { DenseActionCueSchema, type DenseActionCue } from "@yt/contracts";

export async function insertDenseActionCues(
  client: pg.PoolClient,
  videoId: string,
  cues: Array<{
    start_ms: number;
    end_ms: number;
    description: string;
    interpolated: boolean;
    scene_type: string | null;
    source_frame_id: string | null;
    confidence: number | null;
    metadata_json?: unknown;
  }>,
): Promise<void> {
  const batchSize = 200;
  for (let i = 0; i < cues.length; i += batchSize) {
    const batch = cues.slice(i, i + batchSize);
    for (const cue of batch) {
      await client.query(
        `INSERT INTO action_transcript_cues
          (video_id, start_ms, end_ms, description, interpolated, scene_type, source_frame_id, confidence, metadata_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          videoId,
          cue.start_ms,
          cue.end_ms,
          cue.description,
          cue.interpolated,
          cue.scene_type,
          cue.source_frame_id,
          cue.confidence,
          JSON.stringify(cue.metadata_json ?? {}),
        ],
      );
    }
  }
}

export async function getDenseActionCuesByVideo(
  client: pg.PoolClient,
  videoId: string,
  opts?: { limit?: number },
): Promise<DenseActionCue[]> {
  const limit = Math.min(opts?.limit ?? 5000, 10000);
  const res = await client.query(
    `SELECT
       id::text, video_id::text, start_ms, end_ms, description,
       interpolated, scene_type, source_frame_id::text,
       confidence, metadata_json, created_at::text
     FROM action_transcript_cues
     WHERE video_id = $1
     ORDER BY start_ms ASC
     LIMIT $2`,
    [videoId, limit],
  );
  return res.rows.map((r) => DenseActionCueSchema.parse(r));
}

export async function getDenseActionCuesInWindow(
  client: pg.PoolClient,
  videoId: string,
  startMs: number,
  endMs: number,
): Promise<DenseActionCue[]> {
  const res = await client.query(
    `SELECT
       id::text, video_id::text, start_ms, end_ms, description,
       interpolated, scene_type, source_frame_id::text,
       confidence, metadata_json, created_at::text
     FROM action_transcript_cues
     WHERE video_id = $1 AND start_ms >= $2 AND end_ms <= $3
     ORDER BY start_ms ASC`,
    [videoId, startMs, endMs],
  );
  return res.rows.map((r) => DenseActionCueSchema.parse(r));
}

export async function searchDenseActionCuesKeyword(
  client: pg.PoolClient,
  videoId: string,
  query: string,
  opts?: { limit?: number },
): Promise<DenseActionCue[]> {
  const limit = Math.min(opts?.limit ?? 20, 50);
  const res = await client.query(
    `WITH q AS (
       SELECT websearch_to_tsquery('english', $2) as q
     )
     SELECT
       c.id::text, c.video_id::text, c.start_ms, c.end_ms, c.description,
       c.interpolated, c.scene_type, c.source_frame_id::text,
       c.confidence, c.metadata_json, c.created_at::text,
       CASE WHEN q.q = ''::tsquery THEN 0.01 ELSE ts_rank_cd(c.tsv, q.q) END as score
     FROM action_transcript_cues c
     JOIN q ON true
     WHERE c.video_id = $1
       AND ((q.q <> ''::tsquery AND c.tsv @@ q.q)
         OR (q.q = ''::tsquery AND c.description ILIKE ('%' || $2 || '%')))
     ORDER BY score DESC
     LIMIT $3`,
    [videoId, query, limit],
  );
  return res.rows.map((r) => DenseActionCueSchema.parse(r));
}

export async function deleteDenseActionCuesForVideo(
  client: pg.PoolClient,
  videoId: string,
): Promise<void> {
  await client.query(`DELETE FROM action_transcript_cues WHERE video_id = $1`, [videoId]);
}

export async function countDenseActionCues(
  client: pg.PoolClient,
  videoId: string,
): Promise<{ total: number; interpolated: number; direct: number }> {
  const res = await client.query(
    `SELECT
       count(*)::int as total,
       count(*) FILTER (WHERE interpolated = true)::int as interpolated,
       count(*) FILTER (WHERE interpolated = false)::int as direct
     FROM action_transcript_cues
     WHERE video_id = $1`,
    [videoId],
  );
  const row = res.rows[0] ?? { total: 0, interpolated: 0, direct: 0 };
  return { total: row.total, interpolated: row.interpolated, direct: row.direct };
}
