CREATE TABLE IF NOT EXISTS karaoke_playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_karaoke_playlists_updated
  ON karaoke_playlists(updated_at DESC);

CREATE TABLE IF NOT EXISTS karaoke_playlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL REFERENCES karaoke_playlists(id) ON DELETE CASCADE,
  track_id uuid NOT NULL REFERENCES karaoke_tracks(id) ON DELETE CASCADE,
  position integer NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  CHECK (position >= 0),
  UNIQUE (playlist_id, position)
);

CREATE INDEX IF NOT EXISTS idx_karaoke_playlist_items_playlist_position
  ON karaoke_playlist_items(playlist_id, position ASC);

CREATE TABLE IF NOT EXISTS karaoke_session_guest_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES karaoke_sessions(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  scope text NOT NULL DEFAULT 'queue_request',
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz NULL,
  CHECK (scope IN ('queue_request'))
);

CREATE INDEX IF NOT EXISTS idx_karaoke_guest_tokens_session_created
  ON karaoke_session_guest_tokens(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_karaoke_guest_tokens_expires
  ON karaoke_session_guest_tokens(expires_at);

CREATE TABLE IF NOT EXISTS karaoke_guest_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES karaoke_sessions(id) ON DELETE CASCADE,
  track_id uuid NOT NULL REFERENCES karaoke_tracks(id) ON DELETE CASCADE,
  guest_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  handled_at timestamptz NULL,
  CHECK (status IN ('pending', 'approved', 'rejected', 'queued'))
);

CREATE INDEX IF NOT EXISTS idx_karaoke_guest_requests_session_status_created
  ON karaoke_guest_requests(session_id, status, created_at DESC);
