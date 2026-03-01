-- Face identities (clusters of face detections)
CREATE TABLE IF NOT EXISTS face_identities (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id                  UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  label                     TEXT NOT NULL,
  display_name              TEXT NULL,
  representative_embedding  vector(512) NULL,
  representative_frame_id   UUID NULL REFERENCES video_frames(id) ON DELETE SET NULL,
  speaker_id                UUID NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (video_id, label)
);

-- Individual face detections per frame
CREATE TABLE IF NOT EXISTS face_detections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id      UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  frame_id      UUID NOT NULL REFERENCES video_frames(id) ON DELETE CASCADE,
  bbox_json     JSONB NOT NULL,
  det_score     REAL NOT NULL,
  embedding     vector(512) NOT NULL,
  landmarks_json JSONB NULL,
  identity_id   UUID NULL REFERENCES face_identities(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Face appearance timeline (aggregated from detections)
CREATE TABLE IF NOT EXISTS face_appearances (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id      UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  identity_id   UUID NOT NULL REFERENCES face_identities(id) ON DELETE CASCADE,
  start_ms      INTEGER NOT NULL,
  end_ms        INTEGER NOT NULL,
  frame_count   INTEGER NOT NULL DEFAULT 1,
  avg_det_score REAL NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_face_identities_video ON face_identities(video_id);
CREATE INDEX IF NOT EXISTS idx_face_detections_video ON face_detections(video_id);
CREATE INDEX IF NOT EXISTS idx_face_detections_frame ON face_detections(frame_id);
CREATE INDEX IF NOT EXISTS idx_face_detections_identity ON face_detections(identity_id);
CREATE INDEX IF NOT EXISTS idx_face_appearances_video ON face_appearances(video_id);
CREATE INDEX IF NOT EXISTS idx_face_appearances_identity ON face_appearances(identity_id);
