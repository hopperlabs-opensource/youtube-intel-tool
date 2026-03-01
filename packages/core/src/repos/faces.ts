import type pg from "pg";
import {
  FaceIdentitySchema,
  FaceDetectionSchema,
  FaceAppearanceSchema,
  type FaceIdentity,
  type FaceDetection,
  type FaceAppearance,
} from "@yt/contracts";

function toPgVector(v: number[]): string {
  return `[${v.join(",")}]`;
}

// ─── Face Identities ─────────────────────────────────────────────────────────

export async function upsertFaceIdentity(
  client: pg.PoolClient,
  input: {
    video_id: string;
    label: string;
    display_name?: string | null;
    representative_embedding?: number[] | null;
    representative_frame_id?: string | null;
    speaker_id?: string | null;
  },
): Promise<FaceIdentity> {
  const res = await client.query(
    `INSERT INTO face_identities
       (video_id, label, display_name, representative_embedding, representative_frame_id, speaker_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (video_id, label) DO UPDATE SET
       display_name = COALESCE(EXCLUDED.display_name, face_identities.display_name),
       representative_embedding = COALESCE(EXCLUDED.representative_embedding, face_identities.representative_embedding),
       representative_frame_id = COALESCE(EXCLUDED.representative_frame_id, face_identities.representative_frame_id),
       speaker_id = COALESCE(EXCLUDED.speaker_id, face_identities.speaker_id)
     RETURNING id::text, video_id::text, label, display_name, representative_frame_id::text, speaker_id::text, created_at::text`,
    [
      input.video_id,
      input.label,
      input.display_name ?? null,
      input.representative_embedding ? toPgVector(input.representative_embedding) : null,
      input.representative_frame_id ?? null,
      input.speaker_id ?? null,
    ],
  );
  return FaceIdentitySchema.parse(res.rows[0]);
}

export async function listFaceIdentities(
  client: pg.PoolClient,
  videoId: string,
): Promise<FaceIdentity[]> {
  const res = await client.query(
    `SELECT id::text, video_id::text, label, display_name, representative_frame_id::text, speaker_id::text, created_at::text
     FROM face_identities
     WHERE video_id = $1
     ORDER BY label ASC`,
    [videoId],
  );
  return res.rows.map((r) => FaceIdentitySchema.parse(r));
}

export async function updateFaceIdentityDisplayName(
  client: pg.PoolClient,
  videoId: string,
  identityId: string,
  displayName: string,
): Promise<FaceIdentity> {
  const res = await client.query(
    `UPDATE face_identities SET display_name = $3
     WHERE id = $2 AND video_id = $1
     RETURNING id::text, video_id::text, label, display_name, representative_frame_id::text, speaker_id::text, created_at::text`,
    [videoId, identityId, displayName],
  );
  if (res.rows.length === 0) throw new Error("Face identity not found");
  return FaceIdentitySchema.parse(res.rows[0]);
}

// ─── Face Detections ─────────────────────────────────────────────────────────

export async function insertFaceDetections(
  client: pg.PoolClient,
  videoId: string,
  detections: Array<{
    frame_id: string;
    bbox_json: { x: number; y: number; w: number; h: number };
    det_score: number;
    embedding: number[];
    landmarks_json?: unknown;
    identity_id?: string | null;
  }>,
): Promise<void> {
  const batchSize = 200;
  for (let i = 0; i < detections.length; i += batchSize) {
    const batch = detections.slice(i, i + batchSize);
    for (const det of batch) {
      await client.query(
        `INSERT INTO face_detections
          (video_id, frame_id, bbox_json, det_score, embedding, landmarks_json, identity_id)
         VALUES ($1, $2, $3, $4, $5::vector, $6, $7)`,
        [
          videoId,
          det.frame_id,
          JSON.stringify(det.bbox_json),
          det.det_score,
          toPgVector(det.embedding),
          det.landmarks_json ? JSON.stringify(det.landmarks_json) : null,
          det.identity_id ?? null,
        ],
      );
    }
  }
}

export async function assignIdentityToDetections(
  client: pg.PoolClient,
  detectionIds: string[],
  identityId: string,
): Promise<void> {
  if (detectionIds.length === 0) return;
  await client.query(
    `UPDATE face_detections SET identity_id = $1 WHERE id = ANY($2::uuid[])`,
    [identityId, detectionIds],
  );
}

export async function listFaceDetectionsByVideo(
  client: pg.PoolClient,
  videoId: string,
  opts?: { limit?: number },
): Promise<FaceDetection[]> {
  const limit = Math.min(opts?.limit ?? 500, 2000);
  const res = await client.query(
    `SELECT id::text, video_id::text, frame_id::text, bbox_json, det_score, identity_id::text, created_at::text
     FROM face_detections
     WHERE video_id = $1
     ORDER BY created_at ASC
     LIMIT $2`,
    [videoId, limit],
  );
  return res.rows.map((r) => FaceDetectionSchema.parse(r));
}

export async function listFaceDetectionsByFrame(
  client: pg.PoolClient,
  videoId: string,
  frameId: string,
): Promise<FaceDetection[]> {
  const res = await client.query(
    `SELECT id::text, video_id::text, frame_id::text, bbox_json, det_score, identity_id::text, created_at::text
     FROM face_detections
     WHERE video_id = $1 AND frame_id = $2
     ORDER BY det_score DESC`,
    [videoId, frameId],
  );
  return res.rows.map((r) => FaceDetectionSchema.parse(r));
}

// ─── Face Appearances ────────────────────────────────────────────────────────

export async function replaceFaceAppearances(
  client: pg.PoolClient,
  videoId: string,
  appearances: Array<{
    identity_id: string;
    start_ms: number;
    end_ms: number;
    frame_count: number;
    avg_det_score: number | null;
  }>,
): Promise<void> {
  await client.query(`DELETE FROM face_appearances WHERE video_id = $1`, [videoId]);

  for (const app of appearances) {
    await client.query(
      `INSERT INTO face_appearances
        (video_id, identity_id, start_ms, end_ms, frame_count, avg_det_score)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [videoId, app.identity_id, app.start_ms, app.end_ms, app.frame_count, app.avg_det_score],
    );
  }
}

export async function listFaceAppearancesByVideo(
  client: pg.PoolClient,
  videoId: string,
  opts?: { identity_id?: string },
): Promise<FaceAppearance[]> {
  const identityId = opts?.identity_id ?? null;
  const res = await client.query(
    `SELECT id::text, video_id::text, identity_id::text, start_ms, end_ms, frame_count, avg_det_score, created_at::text
     FROM face_appearances
     WHERE video_id = $1
       AND ($2::uuid IS NULL OR identity_id = $2)
     ORDER BY start_ms ASC`,
    [videoId, identityId],
  );
  return res.rows.map((r) => FaceAppearanceSchema.parse(r));
}

// ─── Cross-Reference ─────────────────────────────────────────────────────────

export async function crossReferenceFacesWithSpeakers(
  client: pg.PoolClient,
  videoId: string,
): Promise<Array<{ identity_id: string; speaker_id: string; overlap_ms: number }>> {
  const res = await client.query(
    `SELECT
       fa.identity_id::text,
       ss.speaker_id::text,
       SUM(LEAST(fa.end_ms, ss.end_ms) - GREATEST(fa.start_ms, ss.start_ms))::int as overlap_ms
     FROM face_appearances fa
     JOIN speaker_segments ss ON ss.video_id = fa.video_id
       AND ss.start_ms < fa.end_ms
       AND ss.end_ms > fa.start_ms
     WHERE fa.video_id = $1
     GROUP BY fa.identity_id, ss.speaker_id
     HAVING SUM(LEAST(fa.end_ms, ss.end_ms) - GREATEST(fa.start_ms, ss.start_ms)) > 0
     ORDER BY overlap_ms DESC`,
    [videoId],
  );
  return res.rows;
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

export async function deleteFaceDataForVideo(
  client: pg.PoolClient,
  videoId: string,
): Promise<void> {
  await client.query(`DELETE FROM face_appearances WHERE video_id = $1`, [videoId]);
  await client.query(`DELETE FROM face_detections WHERE video_id = $1`, [videoId]);
  await client.query(`DELETE FROM face_identities WHERE video_id = $1`, [videoId]);
}
