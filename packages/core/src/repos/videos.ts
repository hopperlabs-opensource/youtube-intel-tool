import { TranscriptSchema, VideoSchema, type Transcript, type Video } from "@yt/contracts";
import type pg from "pg";

export async function upsertVideoByProviderId(
  client: pg.PoolClient,
  input: { provider: "youtube"; provider_video_id: string; url: string }
): Promise<Video> {
  const res = await client.query(
    `
    INSERT INTO videos (provider, provider_video_id, url)
    VALUES ($1, $2, $3)
    ON CONFLICT (provider, provider_video_id)
    DO UPDATE SET url = EXCLUDED.url, updated_at = now()
    RETURNING
      id::text as id,
      provider,
      provider_video_id,
      url,
      title,
      channel_name,
      duration_ms,
      thumbnail_url,
      created_at::text as created_at,
      updated_at::text as updated_at
    `,
    [input.provider, input.provider_video_id, input.url]
  );
  return VideoSchema.parse(res.rows[0]);
}

export async function getVideoById(client: pg.PoolClient, videoId: string): Promise<Video | null> {
  const res = await client.query(
    `
    SELECT
      id::text as id,
      provider,
      provider_video_id,
      url,
      title,
      channel_name,
      duration_ms,
      thumbnail_url,
      created_at::text as created_at,
      updated_at::text as updated_at
    FROM videos
    WHERE id = $1
    `,
    [videoId]
  );
  if (res.rowCount === 0) return null;
  return VideoSchema.parse(res.rows[0]);
}

export async function updateVideoMetadata(
  client: pg.PoolClient,
  videoId: string,
  patch: Partial<{ title: string | null; channel_name: string | null; duration_ms: number | null; thumbnail_url: string | null }>
): Promise<Video> {
  const title = typeof patch.title === "string" && patch.title.trim() ? patch.title.trim() : null;
  const channel_name =
    typeof patch.channel_name === "string" && patch.channel_name.trim() ? patch.channel_name.trim() : null;
  const duration_ms = patch.duration_ms ?? null;
  const thumbnail_url =
    typeof patch.thumbnail_url === "string" && patch.thumbnail_url.trim() ? patch.thumbnail_url.trim() : null;

  const res = await client.query(
    `
    UPDATE videos
    SET
      title = COALESCE($2, title),
      channel_name = COALESCE($3, channel_name),
      duration_ms = COALESCE($4, duration_ms),
      thumbnail_url = COALESCE($5, thumbnail_url),
      updated_at = now()
    WHERE id = $1
    RETURNING
      id::text as id,
      provider,
      provider_video_id,
      url,
      title,
      channel_name,
      duration_ms,
      thumbnail_url,
      created_at::text as created_at,
      updated_at::text as updated_at
    `,
    [videoId, title, channel_name, duration_ms, thumbnail_url]
  );
  return VideoSchema.parse(res.rows[0]);
}

export async function listLibraryVideos(
  client: pg.PoolClient,
  opts?: { limit?: number; offset?: number }
): Promise<Array<{ video: Video; latest_transcript: Transcript | null }>> {
  const limit = Math.min(opts?.limit ?? 50, 200);
  const offset = Math.max(0, opts?.offset ?? 0);

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
      t.fetched_at::text as transcript_fetched_at
    FROM videos v
    LEFT JOIN LATERAL (
      SELECT id, language, source, is_generated, fetched_at
      FROM transcripts
      WHERE video_id = v.id
      ORDER BY fetched_at DESC
      LIMIT 1
    ) t ON true
    ORDER BY v.updated_at DESC
    LIMIT $1
    OFFSET $2
    `,
    [limit, offset]
  );

  return res.rows.map((r) => {
    const video = VideoSchema.parse({
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

    const latest_transcript = r.transcript_id
      ? TranscriptSchema.parse({
          id: r.transcript_id,
          video_id: r.video_id,
          language: r.transcript_language,
          source: r.transcript_source,
          is_generated: r.transcript_is_generated,
          fetched_at: r.transcript_fetched_at,
        })
      : null;

    return { video, latest_transcript };
  });
}
