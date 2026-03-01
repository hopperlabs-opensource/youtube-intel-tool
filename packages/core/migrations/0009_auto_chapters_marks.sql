-- Extend existing video_chapters with signal attribution
ALTER TABLE video_chapters
  ADD COLUMN IF NOT EXISTS signals JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS confidence REAL;

-- Significant marks: notable moments within chapters
CREATE TABLE IF NOT EXISTS significant_marks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id      UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  timestamp_ms  INTEGER NOT NULL,
  mark_type     TEXT NOT NULL CHECK (mark_type IN (
    'slide_change', 'demo_start', 'key_statement', 'topic_shift',
    'speaker_change', 'visual_transition', 'text_appears', 'text_disappears'
  )),
  confidence    REAL NOT NULL DEFAULT 0.5,
  description   TEXT,
  metadata_json JSONB DEFAULT '{}',
  chapter_id    UUID REFERENCES video_chapters(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_significant_marks_video_ts ON significant_marks(video_id, timestamp_ms);
CREATE INDEX IF NOT EXISTS idx_significant_marks_type ON significant_marks(video_id, mark_type);
