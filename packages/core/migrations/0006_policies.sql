-- 0006_policies.sql
-- Saved policies + run history + prioritized hits for local feed workflows.

CREATE TABLE IF NOT EXISTS saved_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NULL,
  enabled boolean NOT NULL DEFAULT true,
  search_payload jsonb NOT NULL,
  priority_config jsonb NOT NULL,
  feed_token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_policies_enabled_updated
  ON saved_policies(enabled, updated_at DESC);

CREATE TABLE IF NOT EXISTS policy_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES saved_policies(id) ON DELETE CASCADE,
  status text NOT NULL,
  triggered_by text NOT NULL,
  error text NULL,
  stats_json jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NULL,
  finished_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_policy_runs_policy_created
  ON policy_runs(policy_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_policy_runs_status_created
  ON policy_runs(status, created_at DESC);

CREATE TABLE IF NOT EXISTS policy_hits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES policy_runs(id) ON DELETE CASCADE,
  policy_id uuid NOT NULL REFERENCES saved_policies(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  cue_id uuid NOT NULL REFERENCES transcript_cues(id) ON DELETE CASCADE,
  start_ms integer NOT NULL,
  snippet text NOT NULL,
  base_score real NOT NULL,
  priority_score real NOT NULL,
  priority_bucket text NOT NULL,
  reasons_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, video_id, cue_id)
);

CREATE INDEX IF NOT EXISTS idx_policy_hits_policy_bucket_score
  ON policy_hits(policy_id, priority_bucket, priority_score DESC);

CREATE INDEX IF NOT EXISTS idx_policy_hits_policy_run
  ON policy_hits(policy_id, run_id);
