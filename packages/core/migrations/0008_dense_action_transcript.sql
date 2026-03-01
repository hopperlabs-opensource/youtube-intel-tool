-- Dense second-by-second action transcript cues
CREATE TABLE IF NOT EXISTS action_transcript_cues (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id      UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  start_ms      INTEGER NOT NULL,
  end_ms        INTEGER NOT NULL,
  description   TEXT NOT NULL,
  interpolated  BOOLEAN NOT NULL DEFAULT FALSE,
  scene_type    TEXT,
  source_frame_id UUID REFERENCES video_frames(id) ON DELETE SET NULL,
  confidence    REAL,
  metadata_json JSONB DEFAULT '{}',
  tsv           TSVECTOR GENERATED ALWAYS AS (
                  to_tsvector('english', coalesce(description, ''))
                ) STORED,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_action_cues_video_ts ON action_transcript_cues(video_id, start_ms);
CREATE INDEX IF NOT EXISTS idx_action_cues_tsv ON action_transcript_cues USING GIN(tsv);
