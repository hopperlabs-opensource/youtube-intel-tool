-- 0007_visual.sql: Visual intelligence (action transcripts)
-- Adds tables for frame extraction, vision LLM analysis, frame chunking,
-- and extends embeddings for visual source type.

-- video_frames: one row per extracted keyframe (metadata, not pixels)
CREATE TABLE IF NOT EXISTS video_frames (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id      UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  frame_index   INTEGER NOT NULL,
  timestamp_ms  INTEGER NOT NULL,
  file_path     TEXT NOT NULL,
  width         INTEGER,
  height        INTEGER,
  file_size_bytes INTEGER,
  extraction_method TEXT NOT NULL DEFAULT 'scene_detect',
  scene_score   REAL,
  sharpness     REAL,
  is_blank      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (video_id, frame_index)
);
CREATE INDEX IF NOT EXISTS idx_video_frames_video_ts ON video_frames (video_id, timestamp_ms);

-- frame_analyses: vision LLM output per frame (the "action transcript cue")
CREATE TABLE IF NOT EXISTS frame_analyses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id      UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  frame_id      UUID NOT NULL REFERENCES video_frames(id) ON DELETE CASCADE,
  start_ms      INTEGER NOT NULL,
  end_ms        INTEGER NOT NULL,
  description   TEXT NOT NULL,
  objects       JSONB DEFAULT '[]',
  text_overlay  TEXT,
  scene_type    TEXT,
  provider      TEXT NOT NULL,
  model         TEXT NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  tsv           TSVECTOR GENERATED ALWAYS AS (
                  to_tsvector('english', coalesce(description, '') || ' ' || coalesce(text_overlay, ''))
                ) STORED,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (frame_id)
);
CREATE INDEX IF NOT EXISTS idx_frame_analyses_video_ts ON frame_analyses (video_id, start_ms);
CREATE INDEX IF NOT EXISTS idx_frame_analyses_tsv      ON frame_analyses USING GIN (tsv);

-- frame_chunks: semantic chunks from consecutive frame_analyses (mirrors transcript_chunks)
CREATE TABLE IF NOT EXISTS frame_chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id      UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  chunk_index   INTEGER NOT NULL,
  start_ms      INTEGER NOT NULL,
  end_ms        INTEGER NOT NULL,
  text          TEXT NOT NULL,
  token_estimate INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (video_id, chunk_index)
);

-- Extend embeddings table for visual chunks
ALTER TABLE embeddings
  ADD COLUMN IF NOT EXISTS frame_chunk_id UUID REFERENCES frame_chunks(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'transcript';

-- Add check constraint for source_type (use DO block to be idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'embeddings_source_type_check'
  ) THEN
    ALTER TABLE embeddings
      ADD CONSTRAINT embeddings_source_type_check
      CHECK (source_type IN ('transcript', 'visual'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_embeddings_visual_source ON embeddings (source_type) WHERE source_type = 'visual';
CREATE INDEX IF NOT EXISTS idx_embeddings_visual_frame_chunk ON embeddings (frame_chunk_id) WHERE source_type = 'visual';

-- visual_jobs_meta: processing config per video for caching/rerun
CREATE TABLE IF NOT EXISTS visual_jobs_meta (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id        UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  extraction_strategy TEXT NOT NULL,
  frames_per_minute   REAL,
  scene_threshold     REAL,
  vision_provider     TEXT NOT NULL,
  vision_model        TEXT NOT NULL,
  total_frames_extracted INTEGER,
  total_frames_analyzed  INTEGER,
  total_tokens_used      INTEGER,
  cache_key           TEXT,
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (video_id)
);
