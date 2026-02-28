import type pg from "pg";
import { VideoSourceSchema, type VideoProvider, type VideoSource } from "@yt/contracts";

export async function upsertVideoSource(
  client: pg.PoolClient,
  input: {
    provider: VideoProvider;
    provider_video_id: string;
    url: string;
    title: string | null;
    channel_name: string | null;
    thumbnail_url: string | null;
    duration_ms: number | null;
    rank: number;
    discovered_via: string;
    discovered_key: string | null;
    expires_at: Date | null;
  }
): Promise<VideoSource> {
  const res = await client.query(
    `
    INSERT INTO video_sources (
      provider,
      provider_video_id,
      url,
      title,
      channel_name,
      thumbnail_url,
      duration_ms,
      rank,
      discovered_via,
      discovered_key,
      expires_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (provider, provider_video_id, discovered_via, discovered_key)
    DO UPDATE SET
      url = EXCLUDED.url,
      title = COALESCE(EXCLUDED.title, video_sources.title),
      channel_name = COALESCE(EXCLUDED.channel_name, video_sources.channel_name),
      thumbnail_url = COALESCE(EXCLUDED.thumbnail_url, video_sources.thumbnail_url),
      duration_ms = COALESCE(EXCLUDED.duration_ms, video_sources.duration_ms),
      rank = EXCLUDED.rank,
      fetched_at = now(),
      expires_at = EXCLUDED.expires_at
    RETURNING
      id::text as id,
      provider,
      provider_video_id,
      url,
      title,
      channel_name,
      thumbnail_url,
      duration_ms,
      rank,
      discovered_via,
      discovered_key,
      fetched_at::text as fetched_at,
      expires_at::text as expires_at
    `,
    [
      input.provider,
      input.provider_video_id,
      input.url,
      input.title,
      input.channel_name,
      input.thumbnail_url,
      input.duration_ms,
      Math.max(0, Math.floor(input.rank)),
      input.discovered_via,
      input.discovered_key,
      input.expires_at,
    ]
  );
  return VideoSourceSchema.parse(res.rows[0]);
}

export async function listVideoSources(
  client: pg.PoolClient,
  opts: {
    discovered_via: string;
    discovered_key: string | null;
    limit?: number;
    only_fresh?: boolean;
  }
): Promise<VideoSource[]> {
  const limit = Math.min(opts.limit ?? 20, 200);
  const onlyFresh = opts.only_fresh ?? true;

  const res = await client.query(
    `
    SELECT
      id::text as id,
      provider,
      provider_video_id,
      url,
      title,
      channel_name,
      thumbnail_url,
      duration_ms,
      rank,
      discovered_via,
      discovered_key,
      fetched_at::text as fetched_at,
      expires_at::text as expires_at
    FROM video_sources
    WHERE discovered_via = $1
      AND discovered_key IS NOT DISTINCT FROM $2
      AND ($3::boolean = false OR expires_at IS NULL OR expires_at > now())
    ORDER BY rank ASC, fetched_at DESC
    LIMIT $4
    `,
    [opts.discovered_via, opts.discovered_key, onlyFresh, limit]
  );

  return res.rows.map((r) => VideoSourceSchema.parse(r));
}

