-- 0005_discovery.sql
-- Discovery + richer metadata for library polish.

ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS thumbnail_url text NULL;

-- Cache "discovered" videos (YouTube search/channel/playlist) so we can browse and ingest
-- without immediately resolving every URL into a canonical `videos` row.
CREATE TABLE IF NOT EXISTS video_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_video_id text NOT NULL,
  url text NOT NULL,
  title text NULL,
  channel_name text NULL,
  thumbnail_url text NULL,
  duration_ms integer NULL,
  rank integer NOT NULL DEFAULT 0,
  discovered_via text NOT NULL,
  discovered_key text NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL,
  UNIQUE (provider, provider_video_id, discovered_via, discovered_key)
);

CREATE INDEX IF NOT EXISTS idx_video_sources_via_key_fetched
  ON video_sources(discovered_via, discovered_key, fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_video_sources_expires
  ON video_sources(expires_at);

