-- 0002_chat.sql
-- Chat provenance + tracing. Stores each chat turn with retrieval metadata and the final model response.

CREATE TABLE IF NOT EXISTS chat_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  transcript_id uuid NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
  trace_id text NOT NULL,
  provider text NOT NULL,
  model_id text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  at_ms integer NULL,
  request_json jsonb NULL,
  retrieval_json jsonb NULL,
  response_text text NULL,
  response_json jsonb NULL,
  error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL,
  duration_ms integer NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_turns_video_created ON chat_turns(video_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_turns_trace ON chat_turns(trace_id);
CREATE INDEX IF NOT EXISTS idx_chat_turns_status_created ON chat_turns(status, created_at DESC);

