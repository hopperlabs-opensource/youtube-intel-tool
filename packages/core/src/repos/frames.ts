import type pg from "pg";
import type { VideoFrameRow, FrameAnalysisRow, FrameChunkRow, VisualJobsMeta } from "@yt/contracts";

// ─── Video Frames ────────────────────────────────────────────────────────────

export async function insertFrames(
  client: pg.PoolClient,
  videoId: string,
  frames: Array<{
    frame_index: number;
    timestamp_ms: number;
    file_path: string;
    width?: number | null;
    height?: number | null;
    file_size_bytes?: number | null;
    extraction_method: string;
    scene_score?: number | null;
    sharpness?: number | null;
    is_blank: boolean;
  }>,
): Promise<void> {
  if (frames.length === 0) return;

  const batchSize = 200;
  for (let i = 0; i < frames.length; i += batchSize) {
    const batch = frames.slice(i, i + batchSize);
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let paramIdx = 1;

    for (const f of batch) {
      placeholders.push(
        `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`,
      );
      values.push(
        videoId,
        f.frame_index,
        f.timestamp_ms,
        f.file_path,
        f.width ?? null,
        f.height ?? null,
        f.file_size_bytes ?? null,
        f.extraction_method,
        f.scene_score ?? null,
        f.sharpness ?? null,
      );
    }

    await client.query(
      `INSERT INTO video_frames (video_id, frame_index, timestamp_ms, file_path, width, height, file_size_bytes, extraction_method, scene_score, sharpness)
       VALUES ${placeholders.join(", ")}
       ON CONFLICT (video_id, frame_index) DO NOTHING`,
      values,
    );
  }
}

export async function getFramesByVideo(
  client: pg.PoolClient,
  videoId: string,
  opts?: { limit?: number; offset?: number },
): Promise<VideoFrameRow[]> {
  const limit = Math.min(opts?.limit ?? 100, 1000);
  const offset = opts?.offset ?? 0;
  const res = await client.query(
    `SELECT id::text, video_id::text, frame_index, timestamp_ms, file_path, width, height,
            file_size_bytes, extraction_method, scene_score, sharpness, is_blank, created_at::text
     FROM video_frames
     WHERE video_id = $1
     ORDER BY frame_index ASC
     LIMIT $2 OFFSET $3`,
    [videoId, limit, offset],
  );
  return res.rows;
}

export async function getFrameById(
  client: pg.PoolClient,
  videoId: string,
  frameId: string,
): Promise<VideoFrameRow | null> {
  const res = await client.query(
    `SELECT id::text, video_id::text, frame_index, timestamp_ms, file_path, width, height,
            file_size_bytes, extraction_method, scene_score, sharpness, is_blank, created_at::text
     FROM video_frames
     WHERE video_id = $1 AND id = $2`,
    [videoId, frameId],
  );
  return res.rows[0] ?? null;
}

// ─── Frame Analyses ──────────────────────────────────────────────────────────

export async function insertFrameAnalyses(
  client: pg.PoolClient,
  videoId: string,
  analyses: Array<{
    frame_id: string;
    start_ms: number;
    end_ms: number;
    description: string;
    objects: unknown;
    text_overlay: string | null;
    scene_type: string | null;
    provider: string;
    model: string;
    prompt_tokens: number | null;
    completion_tokens: number | null;
  }>,
): Promise<void> {
  if (analyses.length === 0) return;

  for (const a of analyses) {
    await client.query(
      `INSERT INTO frame_analyses (video_id, frame_id, start_ms, end_ms, description, objects, text_overlay, scene_type, provider, model, prompt_tokens, completion_tokens)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (frame_id) DO UPDATE SET
         description = EXCLUDED.description,
         objects = EXCLUDED.objects,
         text_overlay = EXCLUDED.text_overlay,
         scene_type = EXCLUDED.scene_type,
         provider = EXCLUDED.provider,
         model = EXCLUDED.model,
         prompt_tokens = EXCLUDED.prompt_tokens,
         completion_tokens = EXCLUDED.completion_tokens`,
      [
        videoId,
        a.frame_id,
        a.start_ms,
        a.end_ms,
        a.description,
        JSON.stringify(a.objects),
        a.text_overlay,
        a.scene_type,
        a.provider,
        a.model,
        a.prompt_tokens,
        a.completion_tokens,
      ],
    );
  }
}

export async function getFrameAnalysesByVideo(
  client: pg.PoolClient,
  videoId: string,
): Promise<FrameAnalysisRow[]> {
  const res = await client.query(
    `SELECT id::text, video_id::text, frame_id::text, start_ms, end_ms, description,
            objects, text_overlay, scene_type, provider, model, prompt_tokens, completion_tokens, created_at
     FROM frame_analyses
     WHERE video_id = $1
     ORDER BY start_ms ASC`,
    [videoId],
  );
  return res.rows;
}

export async function getFrameAnalysisForFrame(
  client: pg.PoolClient,
  frameId: string,
): Promise<FrameAnalysisRow | null> {
  const res = await client.query(
    `SELECT id::text, video_id::text, frame_id::text, start_ms, end_ms, description,
            objects, text_overlay, scene_type, provider, model, prompt_tokens, completion_tokens, created_at
     FROM frame_analyses
     WHERE frame_id = $1`,
    [frameId],
  );
  return res.rows[0] ?? null;
}

export async function getFrameAnalysesInWindow(
  client: pg.PoolClient,
  videoId: string,
  startMs: number,
  endMs: number,
  opts?: { limit?: number },
): Promise<FrameAnalysisRow[]> {
  const limit = Math.min(opts?.limit ?? 50, 200);
  const res = await client.query(
    `SELECT id::text, video_id::text, frame_id::text, start_ms, end_ms, description,
            objects, text_overlay, scene_type, provider, model, prompt_tokens, completion_tokens, created_at
     FROM frame_analyses
     WHERE video_id = $1 AND start_ms <= $3 AND end_ms >= $2
     ORDER BY start_ms ASC
     LIMIT $4`,
    [videoId, startMs, endMs, limit],
  );
  return res.rows;
}

export async function searchFrameAnalysesKeyword(
  client: pg.PoolClient,
  videoId: string,
  query: string,
  opts?: { limit?: number },
): Promise<Array<{ id: string; start_ms: number; end_ms: number; description: string; score: number }>> {
  const limit = Math.min(opts?.limit ?? 20, 50);
  const res = await client.query(
    `WITH q AS (
       SELECT websearch_to_tsquery('english', $2) as q
     )
     SELECT
       fa.id::text,
       fa.start_ms,
       fa.end_ms,
       fa.description,
       CASE
         WHEN q.q = ''::tsquery THEN 0.01
         ELSE ts_rank_cd(fa.tsv, q.q)
       END as score
     FROM frame_analyses fa
     JOIN q ON true
     WHERE fa.video_id = $1
       AND ((q.q <> ''::tsquery AND fa.tsv @@ q.q)
         OR (q.q = ''::tsquery AND (fa.description ILIKE ('%' || $2 || '%') OR fa.text_overlay ILIKE ('%' || $2 || '%'))))
     ORDER BY score DESC
     LIMIT $3`,
    [videoId, query, limit],
  );
  return res.rows;
}

// ─── Frame Chunks ────────────────────────────────────────────────────────────

export async function insertFrameChunks(
  client: pg.PoolClient,
  videoId: string,
  chunks: Array<{
    chunk_index: number;
    start_ms: number;
    end_ms: number;
    text: string;
    token_estimate: number;
  }>,
): Promise<string[]> {
  if (chunks.length === 0) return [];

  const ids: string[] = [];
  for (const ch of chunks) {
    const res = await client.query(
      `INSERT INTO frame_chunks (video_id, chunk_index, start_ms, end_ms, text, token_estimate)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (video_id, chunk_index) DO UPDATE SET
         start_ms = EXCLUDED.start_ms,
         end_ms = EXCLUDED.end_ms,
         text = EXCLUDED.text,
         token_estimate = EXCLUDED.token_estimate
       RETURNING id::text`,
      [videoId, ch.chunk_index, ch.start_ms, ch.end_ms, ch.text, ch.token_estimate],
    );
    ids.push(res.rows[0].id);
  }
  return ids;
}

export async function getFrameChunksByVideo(
  client: pg.PoolClient,
  videoId: string,
): Promise<FrameChunkRow[]> {
  const res = await client.query(
    `SELECT id::text, video_id::text, chunk_index, start_ms, end_ms, text, token_estimate, created_at::text
     FROM frame_chunks
     WHERE video_id = $1
     ORDER BY chunk_index ASC`,
    [videoId],
  );
  return res.rows;
}

// ─── Visual Jobs Meta ────────────────────────────────────────────────────────

export async function upsertVisualJobMeta(
  client: pg.PoolClient,
  meta: {
    video_id: string;
    extraction_strategy: string;
    frames_per_minute?: number | null;
    scene_threshold?: number | null;
    vision_provider: string;
    vision_model: string;
    total_frames_extracted?: number | null;
    total_frames_analyzed?: number | null;
    total_tokens_used?: number | null;
    cache_key?: string | null;
    started_at?: string | null;
    completed_at?: string | null;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO visual_jobs_meta (
       video_id, extraction_strategy, frames_per_minute, scene_threshold,
       vision_provider, vision_model, total_frames_extracted, total_frames_analyzed,
       total_tokens_used, cache_key, started_at, completed_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (video_id) DO UPDATE SET
       extraction_strategy = EXCLUDED.extraction_strategy,
       frames_per_minute = EXCLUDED.frames_per_minute,
       scene_threshold = EXCLUDED.scene_threshold,
       vision_provider = EXCLUDED.vision_provider,
       vision_model = EXCLUDED.vision_model,
       total_frames_extracted = EXCLUDED.total_frames_extracted,
       total_frames_analyzed = EXCLUDED.total_frames_analyzed,
       total_tokens_used = EXCLUDED.total_tokens_used,
       cache_key = EXCLUDED.cache_key,
       started_at = EXCLUDED.started_at,
       completed_at = EXCLUDED.completed_at`,
    [
      meta.video_id,
      meta.extraction_strategy,
      meta.frames_per_minute ?? null,
      meta.scene_threshold ?? null,
      meta.vision_provider,
      meta.vision_model,
      meta.total_frames_extracted ?? null,
      meta.total_frames_analyzed ?? null,
      meta.total_tokens_used ?? null,
      meta.cache_key ?? null,
      meta.started_at ?? null,
      meta.completed_at ?? null,
    ],
  );
}

export async function getVisualJobMeta(
  client: pg.PoolClient,
  videoId: string,
): Promise<VisualJobsMeta | null> {
  const res = await client.query(
    `SELECT id::text, video_id::text, extraction_strategy, frames_per_minute, scene_threshold,
            vision_provider, vision_model, total_frames_extracted, total_frames_analyzed,
            total_tokens_used, cache_key, started_at::text, completed_at::text, created_at::text
     FROM visual_jobs_meta
     WHERE video_id = $1`,
    [videoId],
  );
  return res.rows[0] ?? null;
}

// ─── Cascade Delete ──────────────────────────────────────────────────────────

export async function deleteVisualDataForVideo(
  client: pg.PoolClient,
  videoId: string,
): Promise<void> {
  // Delete in reverse dependency order; CASCADE handles frame_analyses via frame_id
  // embeddings table doesn't have video_id — join through frame_chunks
  await client.query(
    `DELETE FROM embeddings WHERE source_type = 'visual' AND frame_chunk_id IN (SELECT id FROM frame_chunks WHERE video_id = $1)`,
    [videoId],
  );
  await client.query(`DELETE FROM frame_chunks WHERE video_id = $1`, [videoId]);
  await client.query(`DELETE FROM frame_analyses WHERE video_id = $1`, [videoId]);
  await client.query(`DELETE FROM video_frames WHERE video_id = $1`, [videoId]);
  await client.query(`DELETE FROM visual_jobs_meta WHERE video_id = $1`, [videoId]);
}

// ─── Counting helpers (for status endpoint) ──────────────────────────────────

export async function countVisualData(
  client: pg.PoolClient,
  videoId: string,
): Promise<{
  frames: number;
  analyses: number;
  chunks: number;
  embeddings: number;
}> {
  const res = await client.query(
    `SELECT
       (SELECT count(*) FROM video_frames WHERE video_id = $1)::int AS frames,
       (SELECT count(*) FROM frame_analyses WHERE video_id = $1)::int AS analyses,
       (SELECT count(*) FROM frame_chunks WHERE video_id = $1)::int AS chunks,
       (SELECT count(*) FROM embeddings WHERE source_type = 'visual' AND frame_chunk_id IN (SELECT id FROM frame_chunks WHERE video_id = $1))::int AS embeddings`,
    [videoId],
  );
  return res.rows[0];
}

/**
 * Insert a visual embedding (frame_chunk → embedding with source_type='visual').
 */
export async function insertVisualEmbedding(
  client: pg.PoolClient,
  input: {
    video_id: string;
    frame_chunk_id: string;
    model_id: string;
    dimensions: number;
    embedding: number[];
    text_hash: string;
  },
): Promise<void> {
  const v = `[${input.embedding.join(",")}]`;
  await client.query(
    `INSERT INTO embeddings (frame_chunk_id, model_id, dimensions, embedding, text_hash, source_type)
     VALUES ($1, $2, $3, $4::vector, $5, 'visual')
     ON CONFLICT DO NOTHING`,
    [input.frame_chunk_id, input.model_id, input.dimensions, v, input.text_hash],
  );
}
