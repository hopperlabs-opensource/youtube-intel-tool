import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { getPool } from "@yt/core";
import {
  addJobLog,
  updateJobStatus,
  getVideoById,
  getFramesByVideo,
} from "@yt/core";
import {
  insertFaceDetections,
  upsertFaceIdentity,
  assignIdentityToDetections,
  replaceFaceAppearances,
  crossReferenceFacesWithSpeakers,
  deleteFaceDataForVideo,
  listFaceDetectionsByVideo,
} from "@yt/core";
import { clusterFaces, type FaceForClustering } from "@yt/core";

const execFileAsync = promisify(execFile);

export type IngestFacesJobData = {
  videoId: string;
  det_threshold?: number;
  cluster_threshold?: number;
  force?: boolean;
  trace_id?: string;
};

interface PythonDetection {
  frame_index: number;
  bbox: { x: number; y: number; w: number; h: number };
  det_score: number;
  embedding: number[];
  landmarks?: unknown;
}

export async function runIngestFaces(jobId: string, data: IngestFacesJobData) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await updateJobStatus(client, jobId, { status: "running", progress: 0 });
    await addJobLog(client, jobId, { message: "Face ingest started", data_json: data });

    const video = await getVideoById(client, data.videoId);
    if (!video) {
      await updateJobStatus(client, jobId, { status: "failed", error: "Video not found", progress: 100 });
      return;
    }

    const detThreshold = data.det_threshold ?? 0.5;
    const clusterThreshold = data.cluster_threshold ?? 0.68;

    // Force mode: clear existing face data
    if (data.force) {
      await addJobLog(client, jobId, { message: "Force mode: clearing existing face data" });
      await deleteFaceDataForVideo(client, data.videoId);
    }

    // ── Step 1: Load extracted frames ──────────────────────────────────────
    const frames = await getFramesByVideo(client, data.videoId, { limit: 2000 });
    if (frames.length === 0) {
      await updateJobStatus(client, jobId, {
        status: "failed",
        error: "No frames found — run visual ingest first",
        progress: 100,
      });
      return;
    }

    await addJobLog(client, jobId, { message: `Loaded ${frames.length} frames` });
    await updateJobStatus(client, jobId, { progress: 10 });

    // ── Step 2: Run face detection via Python script ───────────────────────
    const framesDir = path.join(process.cwd(), ".run", "frames", data.videoId);
    const scriptPath = path.join(process.cwd(), "scripts", "face_index.py");

    await addJobLog(client, jobId, {
      message: "Running face detection",
      data_json: { frames_dir: framesDir, det_threshold: detThreshold },
    });

    let detections: PythonDetection[] = [];
    try {
      const { stdout } = await execFileAsync("python3", [
        scriptPath,
        "--frames-dir", framesDir,
        "--det-threshold", String(detThreshold),
        "--output", "json",
      ], { maxBuffer: 50 * 1024 * 1024, timeout: 300_000 });

      detections = JSON.parse(stdout);
    } catch (e: any) {
      const msg = String(e?.message || e);
      await addJobLog(client, jobId, {
        level: "warn",
        message: "Python face_index.py not available or failed, checking for existing detections",
        data_json: { error: msg },
      });

      // Fall through: if detections already exist in DB (from a previous partial run), use those
      const existing = await listFaceDetectionsByVideo(client, data.videoId, { limit: 2000 });
      if (existing.length === 0) {
        await updateJobStatus(client, jobId, {
          status: "failed",
          error: `Face detection script failed: ${msg}`,
          progress: 100,
        });
        return;
      }
      // Use existing detections — skip insert step, go straight to clustering
      await addJobLog(client, jobId, { message: `Using ${existing.length} existing detections` });
    }

    await updateJobStatus(client, jobId, { progress: 30 });

    // ── Step 3: Insert face detections ─────────────────────────────────────
    if (detections.length > 0) {
      const frameIdByIndex = new Map(frames.map((f) => [f.frame_index, f.id]));

      const validDetections = detections
        .filter((d) => frameIdByIndex.has(d.frame_index))
        .map((d) => ({
          frame_id: frameIdByIndex.get(d.frame_index)!,
          bbox_json: d.bbox,
          det_score: d.det_score,
          embedding: d.embedding,
          landmarks_json: d.landmarks ?? null,
        }));

      await insertFaceDetections(client, data.videoId, validDetections);
      await addJobLog(client, jobId, {
        message: `Inserted ${validDetections.length} face detections`,
        data_json: { total: detections.length, valid: validDetections.length },
      });
    }

    await updateJobStatus(client, jobId, { progress: 50 });

    // ── Step 4: Cluster detections ─────────────────────────────────────────
    await addJobLog(client, jobId, { message: "Clustering face embeddings" });

    // Re-read detections from DB to get IDs and embeddings
    const allDetections = await client.query(
      `SELECT id::text, frame_id::text, det_score, embedding::text
       FROM face_detections
       WHERE video_id = $1
       ORDER BY created_at ASC`,
      [data.videoId],
    );

    const facesForClustering: FaceForClustering[] = allDetections.rows.map((r, idx) => ({
      detectionIndex: idx,
      embedding: parseEmbedding(r.embedding),
      det_score: parseFloat(r.det_score),
    }));

    const clusters = clusterFaces(facesForClustering, { threshold: clusterThreshold });
    await addJobLog(client, jobId, {
      message: `Formed ${clusters.length} face clusters`,
      data_json: { clusters: clusters.length, faces: facesForClustering.length },
    });

    await updateJobStatus(client, jobId, { progress: 65 });

    // ── Step 5: Create face identities from clusters ───────────────────────
    for (const cluster of clusters) {
      const representativeDetection = allDetections.rows[cluster.representative];
      const identity = await upsertFaceIdentity(client, {
        video_id: data.videoId,
        label: cluster.label,
        representative_embedding: cluster.centroid,
        representative_frame_id: representativeDetection?.frame_id ?? null,
      });

      // Assign all detections in cluster to this identity
      const detectionIds = cluster.members.map((idx) => allDetections.rows[idx].id);
      await assignIdentityToDetections(client, detectionIds, identity.id);
    }

    await updateJobStatus(client, jobId, { progress: 80 });

    // ── Step 6: Compute face appearances timeline ──────────────────────────
    await addJobLog(client, jobId, { message: "Computing face appearances timeline" });

    const appearancesRes = await client.query(
      `SELECT
         fd.identity_id::text,
         MIN(vf.timestamp_ms) as start_ms,
         MAX(vf.timestamp_ms) as end_ms,
         COUNT(*)::int as frame_count,
         AVG(fd.det_score) as avg_det_score
       FROM face_detections fd
       JOIN video_frames vf ON vf.id = fd.frame_id
       WHERE fd.video_id = $1 AND fd.identity_id IS NOT NULL
       GROUP BY fd.identity_id
       ORDER BY start_ms ASC`,
      [data.videoId],
    );

    const appearances = appearancesRes.rows.map((r) => ({
      identity_id: r.identity_id,
      start_ms: parseInt(r.start_ms),
      end_ms: parseInt(r.end_ms),
      frame_count: r.frame_count,
      avg_det_score: r.avg_det_score ? parseFloat(r.avg_det_score) : null,
    }));

    await replaceFaceAppearances(client, data.videoId, appearances);

    await updateJobStatus(client, jobId, { progress: 90 });

    // ── Step 7: Cross-reference faces with speakers ────────────────────────
    await addJobLog(client, jobId, { message: "Cross-referencing faces with speakers" });
    const crossRef = await crossReferenceFacesWithSpeakers(client, data.videoId);

    // Link each face identity to its best-matching speaker
    for (const match of crossRef) {
      if (match.overlap_ms > 0) {
        await client.query(
          `UPDATE face_identities SET speaker_id = $2
           WHERE id = $1 AND speaker_id IS NULL`,
          [match.identity_id, match.speaker_id],
        );
      }
    }

    await addJobLog(client, jobId, {
      message: `Cross-referenced ${crossRef.length} face-speaker matches`,
    });

    // ── Finalize ──────────────────────────────────────────────────────────
    await updateJobStatus(client, jobId, {
      status: "completed",
      progress: 100,
      output_json: {
        video_id: data.videoId,
        detections: allDetections.rows.length,
        clusters: clusters.length,
        appearances: appearances.length,
        speaker_matches: crossRef.length,
        trace_id: data.trace_id ?? null,
      },
    });
    await addJobLog(client, jobId, { message: "Face ingest completed" });
  } catch (err: any) {
    await updateJobStatus(client, jobId, {
      status: "failed",
      progress: 100,
      error: String(err?.message || err),
    });
    await addJobLog(client, jobId, {
      level: "error",
      message: "Face ingest failed",
      data_json: { error: String(err?.message || err) },
    });
  } finally {
    client.release();
  }
}

function parseEmbedding(raw: string): number[] {
  // pgvector returns embeddings as "[0.1,0.2,...]" strings
  const cleaned = raw.replace(/^\[|\]$/g, "");
  return cleaned.split(",").map(Number);
}
