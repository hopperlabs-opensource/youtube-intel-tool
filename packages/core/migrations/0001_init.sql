-- 0001_init.sql
-- Canonical + derived schema for youtube-intel-tool

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_video_id text NOT NULL,
  url text NOT NULL,
  title text NULL,
  channel_name text NULL,
  duration_ms integer NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_video_id)
);

CREATE TABLE IF NOT EXISTS transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  language text NOT NULL,
  source text NOT NULL,
  is_generated boolean NOT NULL DEFAULT false,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  provider_payload jsonb NULL,
  UNIQUE (video_id, language, source)
);

CREATE TABLE IF NOT EXISTS transcript_cues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript_id uuid NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
  idx integer NOT NULL,
  start_ms integer NOT NULL,
  end_ms integer NOT NULL,
  text text NOT NULL,
  norm_text text NOT NULL,
  tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', norm_text)) STORED,
  UNIQUE (transcript_id, idx)
);

CREATE INDEX IF NOT EXISTS idx_transcript_cues_transcript_start ON transcript_cues(transcript_id, start_ms);
CREATE INDEX IF NOT EXISTS idx_transcript_cues_tsv ON transcript_cues USING GIN (tsv);

CREATE TABLE IF NOT EXISTS transcript_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript_id uuid NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
  start_ms integer NOT NULL,
  end_ms integer NOT NULL,
  cue_start_idx integer NOT NULL,
  cue_end_idx integer NOT NULL,
  text text NOT NULL,
  token_estimate integer NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (transcript_id, cue_start_idx, cue_end_idx)
);

CREATE INDEX IF NOT EXISTS idx_transcript_chunks_transcript_start ON transcript_chunks(transcript_id, start_ms);

-- For V1 we pick a single embedding dimension (nomic-embed-text is 768).
CREATE TABLE IF NOT EXISTS embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript_id uuid NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
  chunk_id uuid NOT NULL REFERENCES transcript_chunks(id) ON DELETE CASCADE,
  model_id text NOT NULL,
  dimensions integer NOT NULL,
  embedding vector(768) NOT NULL,
  text_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chunk_id, model_id)
);

-- HNSW is supported in newer pgvector versions; for portability, skip index creation here.
-- You can add later:
-- CREATE INDEX embeddings_hnsw ON embeddings USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  type text NOT NULL,
  canonical_name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (video_id, type, canonical_name)
);

CREATE TABLE IF NOT EXISTS entity_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  cue_id uuid NOT NULL REFERENCES transcript_cues(id) ON DELETE CASCADE,
  start_ms integer NOT NULL,
  end_ms integer NOT NULL,
  surface text NOT NULL,
  confidence real NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entity_mentions_entity_start ON entity_mentions(entity_id, start_ms);
CREATE INDEX IF NOT EXISTS idx_entity_mentions_video_start ON entity_mentions(video_id, start_ms);
CREATE INDEX IF NOT EXISTS idx_entity_mentions_cue ON entity_mentions(cue_id);

CREATE TABLE IF NOT EXISTS context_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  source text NOT NULL,
  source_id text NOT NULL,
  title text NOT NULL,
  snippet text NOT NULL,
  url text NULL,
  payload_json jsonb NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL,
  UNIQUE (entity_id, source, source_id)
);

CREATE INDEX IF NOT EXISTS idx_context_items_entity_source ON context_items(entity_id, source);

CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  status text NOT NULL,
  progress integer NULL,
  input_json jsonb NULL,
  output_json jsonb NULL,
  error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NULL,
  finished_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON jobs(status, created_at DESC);

CREATE TABLE IF NOT EXISTS job_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  ts timestamptz NOT NULL DEFAULT now(),
  level text NOT NULL DEFAULT 'info',
  message text NOT NULL,
  data_json jsonb NULL
);

CREATE INDEX IF NOT EXISTS idx_job_logs_job_ts ON job_logs(job_id, ts ASC);

