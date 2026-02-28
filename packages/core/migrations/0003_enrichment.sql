-- 0003_enrichment.sql
-- Extra derived artifacts produced by enrichment (typically CLI-based).

CREATE TABLE IF NOT EXISTS video_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  tag text NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (video_id, source, tag)
);

CREATE INDEX IF NOT EXISTS idx_video_tags_video_source ON video_tags(video_id, source);

CREATE TABLE IF NOT EXISTS video_chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  transcript_id uuid NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
  start_ms integer NOT NULL,
  end_ms integer NOT NULL,
  title text NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (video_id, source, start_ms, end_ms, title)
);

CREATE INDEX IF NOT EXISTS idx_video_chapters_video_start ON video_chapters(video_id, start_ms);

