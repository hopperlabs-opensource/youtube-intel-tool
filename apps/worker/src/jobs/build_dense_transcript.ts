import { getPool } from "@yt/core";
import {
  addJobLog,
  updateJobStatus,
  getVideoById,
  getFrameAnalysesByVideo,
  getLatestTranscriptForVideo,
  listCuesByTranscript,
  resolveTextConfig,
  createTextLlm,
} from "@yt/core";
import { buildDenseActionTranscript } from "@yt/core";
import {
  insertDenseActionCues,
  deleteDenseActionCuesForVideo,
  countDenseActionCues,
} from "@yt/core";
import type { LlmConfig } from "@yt/contracts";

export type BuildDenseTranscriptJobData = {
  videoId: string;
  force?: boolean;
  llmConfig?: LlmConfig;
  trace_id?: string;
};

export async function runBuildDenseTranscript(jobId: string, data: BuildDenseTranscriptJobData) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await updateJobStatus(client, jobId, { status: "running", progress: 0 });
    await addJobLog(client, jobId, { message: "Dense transcript build started", data_json: data });

    const video = await getVideoById(client, data.videoId);
    if (!video) {
      await updateJobStatus(client, jobId, { status: "failed", error: "Video not found", progress: 100 });
      return;
    }

    // Check if we already have dense cues and aren't forcing
    if (!data.force) {
      const existing = await countDenseActionCues(client, data.videoId);
      if (existing.total > 0) {
        await addJobLog(client, jobId, { message: "Dense transcript already exists, skipping (use force to rebuild)" });
        await updateJobStatus(client, jobId, { status: "completed", progress: 100, output_json: { ...existing, cache_hit: true } });
        return;
      }
    }

    // Load frame analyses
    const analyses = await getFrameAnalysesByVideo(client, data.videoId);
    if (analyses.length === 0) {
      await updateJobStatus(client, jobId, { status: "failed", error: "No frame analyses found — run visual ingest first", progress: 100 });
      return;
    }
    await addJobLog(client, jobId, { message: `Loaded ${analyses.length} frame analyses` });
    await updateJobStatus(client, jobId, { progress: 20 });

    // Load transcript cues
    let transcriptCues: any[] = [];
    try {
      const transcript = await getLatestTranscriptForVideo(client, data.videoId, { language: "en" });
      if (transcript) {
        const cuesRes = await listCuesByTranscript(client, transcript.id, { cursorIdx: 0, limit: 5000 });
        transcriptCues = cuesRes.cues;
      }
    } catch {
      // Transcript may not exist
    }
    await addJobLog(client, jobId, { message: `Loaded ${transcriptCues.length} transcript cues` });
    await updateJobStatus(client, jobId, { progress: 30 });

    // Create unified LLM
    const llmConfig = resolveTextConfig(data.llmConfig);
    const textLlm = createTextLlm(llmConfig);
    await addJobLog(client, jobId, { message: `Using LLM: ${llmConfig.textProvider}/${llmConfig.textModel}` });

    // Run interpolation engine
    await addJobLog(client, jobId, { message: "Building dense transcript with interpolation" });
    const denseCues = await buildDenseActionTranscript({
      analyses,
      transcriptCues,
      llmCall: async (prompt) => {
        const res = await textLlm.call(prompt);
        return res.text;
      },
    });
    await addJobLog(client, jobId, { message: `Generated ${denseCues.length} dense cues` });
    await updateJobStatus(client, jobId, { progress: 70 });

    // Clear existing and insert new
    if (data.force) {
      await deleteDenseActionCuesForVideo(client, data.videoId);
    }
    await insertDenseActionCues(client, data.videoId, denseCues);
    await updateJobStatus(client, jobId, { progress: 90 });

    const counts = await countDenseActionCues(client, data.videoId);
    await updateJobStatus(client, jobId, {
      status: "completed",
      progress: 100,
      output_json: {
        video_id: data.videoId,
        ...counts,
        provider: llmConfig.textProvider,
        model: llmConfig.textModel,
        trace_id: data.trace_id ?? null,
      },
    });
    await addJobLog(client, jobId, { message: "Dense transcript build completed" });
  } catch (err: any) {
    await updateJobStatus(client, jobId, { status: "failed", progress: 100, error: String(err?.message || err) });
    await addJobLog(client, jobId, { level: "error", message: "Dense transcript build failed", data_json: { error: String(err?.message || err) } });
  } finally {
    client.release();
  }
}
