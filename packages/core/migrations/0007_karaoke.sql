CREATE TABLE IF NOT EXISTS karaoke_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE UNIQUE,
  provider_video_id text NOT NULL,
  title text NULL,
  channel_name text NULL,
  thumbnail_url text NULL,
  duration_ms integer NULL,
  language text NOT NULL DEFAULT 'en',
  ready_state text NOT NULL DEFAULT 'pending',
  cue_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ready_state IN ('pending', 'ready', 'failed')),
  CHECK (cue_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_karaoke_tracks_ready_updated
  ON karaoke_tracks(ready_state, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_karaoke_tracks_provider_video
  ON karaoke_tracks(provider_video_id);

CREATE TABLE IF NOT EXISTS karaoke_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  theme_id text NOT NULL DEFAULT 'gold-stage',
  host_mode text NOT NULL DEFAULT 'single_host',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  CHECK (host_mode IN ('single_host'))
);

CREATE INDEX IF NOT EXISTS idx_karaoke_sessions_status_updated
  ON karaoke_sessions(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS karaoke_queue_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES karaoke_sessions(id) ON DELETE CASCADE,
  track_id uuid NOT NULL REFERENCES karaoke_tracks(id) ON DELETE CASCADE,
  requested_by text NOT NULL,
  position integer NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  started_at timestamptz NULL,
  ended_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (position >= 0),
  CHECK (status IN ('queued', 'playing', 'skipped', 'completed')),
  UNIQUE (session_id, position)
);

CREATE INDEX IF NOT EXISTS idx_karaoke_queue_session_position
  ON karaoke_queue_items(session_id, position ASC);

CREATE INDEX IF NOT EXISTS idx_karaoke_queue_session_status_started
  ON karaoke_queue_items(session_id, status, started_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS karaoke_score_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES karaoke_sessions(id) ON DELETE CASCADE,
  queue_item_id uuid NOT NULL REFERENCES karaoke_queue_items(id) ON DELETE CASCADE,
  player_name text NOT NULL,
  cue_id uuid NOT NULL REFERENCES transcript_cues(id) ON DELETE CASCADE,
  expected_at_ms integer NOT NULL,
  actual_at_ms integer NOT NULL,
  timing_error_ms integer NOT NULL,
  awarded_points integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expected_at_ms >= 0),
  CHECK (actual_at_ms >= 0),
  CHECK (timing_error_ms >= 0),
  CHECK (awarded_points >= 0)
);

CREATE INDEX IF NOT EXISTS idx_karaoke_scores_session_player_created
  ON karaoke_score_events(session_id, player_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_karaoke_scores_queue_cue
  ON karaoke_score_events(queue_item_id, cue_id);
