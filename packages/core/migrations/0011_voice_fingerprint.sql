-- Speaker voice embeddings for cross-video matching
CREATE TABLE IF NOT EXISTS speaker_embeddings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  speaker_id    UUID NOT NULL REFERENCES video_speakers(id) ON DELETE CASCADE,
  video_id      UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  embedding     vector(256) NOT NULL,
  model_id      TEXT NOT NULL,
  segment_count INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (speaker_id, model_id)
);

-- Global speaker identity database
CREATE TABLE IF NOT EXISTS global_speakers (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name              TEXT NOT NULL,
  representative_embedding  vector(256) NULL,
  face_identity_id          UUID NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Links between per-video speakers and global speakers
CREATE TABLE IF NOT EXISTS global_speaker_links (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  global_speaker_id UUID NOT NULL REFERENCES global_speakers(id) ON DELETE CASCADE,
  speaker_id        UUID NOT NULL REFERENCES video_speakers(id) ON DELETE CASCADE,
  confidence        REAL NULL,
  source            TEXT NOT NULL DEFAULT 'auto',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (speaker_id)
);

CREATE INDEX IF NOT EXISTS idx_speaker_embeddings_video ON speaker_embeddings(video_id);
CREATE INDEX IF NOT EXISTS idx_speaker_embeddings_speaker ON speaker_embeddings(speaker_id);
CREATE INDEX IF NOT EXISTS idx_global_speaker_links_global ON global_speaker_links(global_speaker_id);
CREATE INDEX IF NOT EXISTS idx_global_speaker_links_speaker ON global_speaker_links(speaker_id);
