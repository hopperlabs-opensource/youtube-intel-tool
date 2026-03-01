import { execFile, type ExecFileOptions } from "child_process";
import { promisify } from "util";
import { getPool } from "@yt/core";
import {
  addJobLog,
  updateJobStatus,
  getVideoById,
  listVideoSpeakers,
  listSpeakerSegmentsForVideo,
} from "@yt/core";
import {
  insertSpeakerEmbeddings,
  deleteVoiceDataForVideo,
} from "@yt/core";
import {
  matchSpeakerAcrossVideos,
  createOrLinkGlobalSpeaker,
} from "@yt/core";
import { ensureVideoFile } from "@yt/core";

const execFileAsync = promisify(execFile);

export type IngestVoiceJobData = {
  videoId: string;
  force?: boolean;
  trace_id?: string;
};

interface PythonVoiceEmbedding {
  speaker_id: string;
  embedding: number[];
  model_id: string;
  segment_count: number;
}

export async function runIngestVoice(jobId: string, data: IngestVoiceJobData) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await updateJobStatus(client, jobId, { status: "running", progress: 0 });
    await addJobLog(client, jobId, { message: "Voice ingest started", data_json: data });

    const video = await getVideoById(client, data.videoId);
    if (!video) {
      await updateJobStatus(client, jobId, { status: "failed", error: "Video not found", progress: 100 });
      return;
    }

    // Force mode: clear existing voice data
    if (data.force) {
      await addJobLog(client, jobId, { message: "Force mode: clearing existing voice data" });
      await deleteVoiceDataForVideo(client, data.videoId);
    }

    // ── Step 1: Load speaker segments ──────────────────────────────────────
    const speakers = await listVideoSpeakers(client, data.videoId);
    if (speakers.length === 0) {
      await updateJobStatus(client, jobId, {
        status: "failed",
        error: "No speakers found — run diarization first",
        progress: 100,
      });
      return;
    }

    const segments = await listSpeakerSegmentsForVideo(client, {
      video_id: data.videoId,
      limit: 5000,
    });

    await addJobLog(client, jobId, {
      message: `Loaded ${speakers.length} speakers, ${segments.length} segments`,
    });
    await updateJobStatus(client, jobId, { progress: 15 });

    // ── Step 2: Download audio if needed ───────────────────────────────────
    await addJobLog(client, jobId, { message: "Ensuring audio file available" });
    let audioPath: string;
    try {
      audioPath = await ensureVideoFile(video.url, { maxHeight: 720 });
    } catch (e: any) {
      await addJobLog(client, jobId, {
        level: "warn",
        message: "Audio download failed, trying with existing files",
        data_json: { error: String(e?.message || e) },
      });
      audioPath = "";
    }
    await updateJobStatus(client, jobId, { progress: 30 });

    // ── Step 3: Run voice embedding via Python script ──────────────────────
    const scriptPath = `${process.cwd()}/scripts/voice_embed.py`;

    // Build speaker segments JSON for stdin
    const speakerSegments = speakers.map((s) => ({
      speaker_id: s.id,
      speaker_key: s.key,
      segments: segments
        .filter((seg) => seg.speaker_id === s.id)
        .map((seg) => ({ start_ms: seg.start_ms, end_ms: seg.end_ms })),
    }));

    await addJobLog(client, jobId, {
      message: "Running voice embedding extraction",
      data_json: { speakers: speakers.length },
    });

    let voiceEmbeddings: PythonVoiceEmbedding[] = [];
    try {
      const input = JSON.stringify({
        audio_path: audioPath,
        speakers: speakerSegments,
      });

      const { stdout } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        const child = execFile("python3", [
          scriptPath,
          "--output", "json",
        ], { maxBuffer: 50 * 1024 * 1024, timeout: 300_000 } satisfies ExecFileOptions, (err, stdout, stderr) => {
          if (err) return reject(err);
          resolve({ stdout: stdout as string, stderr: stderr as string });
        });
        child.stdin?.write(input);
        child.stdin?.end();
      });

      voiceEmbeddings = JSON.parse(stdout);
    } catch (e: any) {
      const msg = String(e?.message || e);
      await addJobLog(client, jobId, {
        level: "warn",
        message: "Python voice_embed.py not available or failed",
        data_json: { error: msg },
      });
      await updateJobStatus(client, jobId, {
        status: "failed",
        error: `Voice embedding extraction failed: ${msg}`,
        progress: 100,
      });
      return;
    }

    await updateJobStatus(client, jobId, { progress: 60 });

    // ── Step 4: Insert speaker embeddings ──────────────────────────────────
    if (voiceEmbeddings.length > 0) {
      await insertSpeakerEmbeddings(
        client,
        voiceEmbeddings.map((ve) => ({
          speaker_id: ve.speaker_id,
          video_id: data.videoId,
          embedding: ve.embedding,
          model_id: ve.model_id,
          segment_count: ve.segment_count,
        })),
      );
      await addJobLog(client, jobId, {
        message: `Stored ${voiceEmbeddings.length} speaker embeddings`,
      });
    }

    await updateJobStatus(client, jobId, { progress: 75 });

    // ── Step 5: Auto-match against existing global speakers ────────────────
    await addJobLog(client, jobId, { message: "Auto-matching against global speakers" });
    let matchCount = 0;
    let linkCount = 0;

    for (const ve of voiceEmbeddings) {
      const matches = await matchSpeakerAcrossVideos(client, ve.speaker_id, {
        threshold: 0.85,
        limit: 5,
        excludeVideoId: data.videoId,
      });

      if (matches.length > 0) {
        matchCount += matches.length;

        // Find if any matched speaker already has a global speaker link
        const bestMatch = matches[0];
        const existingLink = await client.query(
          `SELECT global_speaker_id::text FROM global_speaker_links WHERE speaker_id = $1 LIMIT 1`,
          [bestMatch.speaker_id],
        );

        if (existingLink.rows.length > 0) {
          // Link this speaker to the same global speaker
          await createOrLinkGlobalSpeaker(client, {
            displayName: "", // Will use existing
            speakerId: ve.speaker_id,
            videoId: data.videoId,
            existingGlobalSpeakerId: existingLink.rows[0].global_speaker_id,
            confidence: bestMatch.similarity,
          });
          linkCount++;
        }
      }
    }

    await addJobLog(client, jobId, {
      message: `Auto-match: ${matchCount} cross-video matches, ${linkCount} global speaker links created`,
    });

    // ── Finalize ──────────────────────────────────────────────────────────
    await updateJobStatus(client, jobId, {
      status: "completed",
      progress: 100,
      output_json: {
        video_id: data.videoId,
        speakers: speakers.length,
        embeddings: voiceEmbeddings.length,
        cross_video_matches: matchCount,
        global_speaker_links: linkCount,
        trace_id: data.trace_id ?? null,
      },
    });
    await addJobLog(client, jobId, { message: "Voice ingest completed" });
  } catch (err: any) {
    await updateJobStatus(client, jobId, {
      status: "failed",
      progress: 100,
      error: String(err?.message || err),
    });
    await addJobLog(client, jobId, {
      level: "error",
      message: "Voice ingest failed",
      data_json: { error: String(err?.message || err) },
    });
  } finally {
    client.release();
  }
}
