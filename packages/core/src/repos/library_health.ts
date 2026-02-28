import type pg from "pg";
import { LibraryHealthItemSchema, TranscriptSchema, VideoSchema, type LibraryHealthItem, type Transcript, type Video } from "@yt/contracts";

export async function listLibraryHealth(
  client: pg.PoolClient,
  opts?: { limit?: number; offset?: number; embeddings_model_id?: string | null }
): Promise<LibraryHealthItem[]> {
  const limit = Math.min(opts?.limit ?? 200, 500);
  const offset = Math.max(0, opts?.offset ?? 0);
  const modelId = opts?.embeddings_model_id ?? null;

  const res = await client.query(
    `
    SELECT
      v.id::text as video_id,
      v.provider as video_provider,
      v.provider_video_id as video_provider_video_id,
      v.url as video_url,
      v.title as video_title,
      v.channel_name as video_channel_name,
      v.duration_ms as video_duration_ms,
      v.thumbnail_url as video_thumbnail_url,
      v.created_at::text as video_created_at,
      v.updated_at::text as video_updated_at,

      t.id::text as transcript_id,
      t.language as transcript_language,
      t.source as transcript_source,
      t.is_generated as transcript_is_generated,
      t.fetched_at::text as transcript_fetched_at,

      CASE
        WHEN t.id IS NULL THEN NULL
        ELSE (SELECT count(*)::int FROM transcript_cues c WHERE c.transcript_id = t.id)
      END as cues,

      CASE
        WHEN t.id IS NULL THEN NULL
        ELSE (SELECT count(*)::int FROM transcript_chunks ch WHERE ch.transcript_id = t.id)
      END as chunks,

      CASE
        WHEN t.id IS NULL OR $1::text IS NULL THEN NULL
        ELSE (SELECT count(*)::int FROM embeddings e WHERE e.transcript_id = t.id AND e.model_id = $1)
      END as embeddings,

      (SELECT count(*)::int FROM entities e WHERE e.video_id = v.id) as entities,
      (SELECT count(*)::int FROM video_speakers s WHERE s.video_id = v.id) as speakers,
      (
        SELECT count(*)::int
        FROM context_items ci
        JOIN entities e ON e.id = ci.entity_id
        WHERE e.video_id = v.id
      ) as context_items
    FROM videos v
    LEFT JOIN LATERAL (
      SELECT id, language, source, is_generated, fetched_at
      FROM transcripts
      WHERE video_id = v.id
      ORDER BY fetched_at DESC
      LIMIT 1
    ) t ON true
    ORDER BY v.updated_at DESC
    LIMIT $2
    OFFSET $3
    `,
    [modelId, limit, offset]
  );

  return res.rows.map((r: any) => {
    const video: Video = VideoSchema.parse({
      id: r.video_id,
      provider: r.video_provider,
      provider_video_id: r.video_provider_video_id,
      url: r.video_url,
      title: r.video_title,
      channel_name: r.video_channel_name,
      duration_ms: r.video_duration_ms,
      thumbnail_url: r.video_thumbnail_url,
      created_at: r.video_created_at,
      updated_at: r.video_updated_at,
    });

    const latest_transcript: Transcript | null = r.transcript_id
      ? TranscriptSchema.parse({
          id: r.transcript_id,
          video_id: r.video_id,
          language: r.transcript_language,
          source: r.transcript_source,
          is_generated: r.transcript_is_generated,
          fetched_at: r.transcript_fetched_at,
        })
      : null;

    return LibraryHealthItemSchema.parse({
      video,
      latest_transcript,
      cues: r.cues ?? null,
      chunks: r.chunks ?? null,
      embeddings: r.embeddings ?? null,
      entities: r.entities ?? 0,
      speakers: r.speakers ?? 0,
      context_items: r.context_items ?? 0,
    });
  });
}

