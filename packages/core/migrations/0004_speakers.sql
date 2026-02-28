-- 0004_speakers.sql
-- Speaker diarization artifacts (anonymous speakers, segments, cue-level assignment).

CREATE TABLE IF NOT EXISTS video_speakers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (video_id, key)
);

CREATE INDEX IF NOT EXISTS idx_video_speakers_video ON video_speakers(video_id);

CREATE TABLE IF NOT EXISTS speaker_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  transcript_id uuid NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
  speaker_id uuid NOT NULL REFERENCES video_speakers(id) ON DELETE CASCADE,
  start_ms integer NOT NULL,
  end_ms integer NOT NULL,
  confidence real NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_speaker_segments_video_start ON speaker_segments(video_id, start_ms);
CREATE INDEX IF NOT EXISTS idx_speaker_segments_speaker_start ON speaker_segments(speaker_id, start_ms);

-- One (best) speaker assignment per cue (derived from segments). Missing cues simply have no row.
CREATE TABLE IF NOT EXISTS cue_speakers (
  cue_id uuid PRIMARY KEY REFERENCES transcript_cues(id) ON DELETE CASCADE,
  transcript_id uuid NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
  speaker_id uuid NOT NULL REFERENCES video_speakers(id) ON DELETE CASCADE,
  confidence real NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cue_speakers_transcript ON cue_speakers(transcript_id);
CREATE INDEX IF NOT EXISTS idx_cue_speakers_speaker ON cue_speakers(speaker_id);

