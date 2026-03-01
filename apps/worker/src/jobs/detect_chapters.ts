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
import {
  detectVisualTransitions,
  detectOcrChanges,
  detectTopicShifts,
  detectSpeakerChanges,
  detectChapterBoundaries,
  generateChapterTitles,
} from "@yt/core";
import {
  replaceAutoChapters,
  insertSignificantMarks,
  deleteSignificantMarksForVideo,
} from "@yt/core";
import type { LlmConfig } from "@yt/contracts";

export type DetectChaptersJobData = {
  videoId: string;
  force?: boolean;
  min_signals?: number;
  window_ms?: number;
  llmConfig?: LlmConfig;
  trace_id?: string;
};

export async function runDetectChapters(jobId: string, data: DetectChaptersJobData) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await updateJobStatus(client, jobId, { status: "running", progress: 0 });
    await addJobLog(client, jobId, { message: "Auto-chapter detection started", data_json: data });

    const video = await getVideoById(client, data.videoId);
    if (!video) {
      await updateJobStatus(client, jobId, { status: "failed", error: "Video not found", progress: 100 });
      return;
    }

    // Load frame analyses
    const analyses = await getFrameAnalysesByVideo(client, data.videoId);
    await addJobLog(client, jobId, { message: `Loaded ${analyses.length} frame analyses` });

    // Load transcript cues
    let transcriptCues: any[] = [];
    let transcriptId: string | null = null;
    try {
      const transcript = await getLatestTranscriptForVideo(client, data.videoId, { language: "en" });
      if (transcript) {
        transcriptId = transcript.id;
        const cuesRes = await listCuesByTranscript(client, transcript.id, { cursorIdx: 0, limit: 5000 });
        transcriptCues = cuesRes.cues;
      }
    } catch { /* no transcript */ }
    await addJobLog(client, jobId, { message: `Loaded ${transcriptCues.length} transcript cues` });
    await updateJobStatus(client, jobId, { progress: 20 });

    // Run all signal detectors
    const allCandidates = [
      ...detectVisualTransitions(analyses),
      ...detectOcrChanges(analyses),
      ...detectTopicShifts(transcriptCues),
      ...detectSpeakerChanges([]), // Would need speaker segments — pass empty for now
    ];

    await addJobLog(client, jobId, {
      message: `Found ${allCandidates.length} boundary candidates`,
      data_json: {
        visual: allCandidates.filter((c) => c.signal === "visual_transition").length,
        ocr: allCandidates.filter((c) => c.signal === "ocr_change").length,
        topic: allCandidates.filter((c) => c.signal === "topic_shift").length,
        speaker: allCandidates.filter((c) => c.signal === "speaker_change").length,
        phash: allCandidates.filter((c) => c.signal === "phash_jump").length,
      },
    });
    await updateJobStatus(client, jobId, { progress: 50 });

    // Run voting algorithm
    const totalDurationMs = video.duration_ms ?? (transcriptCues.length > 0 ? transcriptCues[transcriptCues.length - 1].end_ms : 0);
    const { chapters, remainingMarks } = detectChapterBoundaries(allCandidates, {
      minSignals: data.min_signals ?? 2,
      windowMs: data.window_ms ?? 3000,
      totalDurationMs,
    });

    await addJobLog(client, jobId, {
      message: `Detected ${chapters.length} chapters, ${remainingMarks.length} remaining marks`,
    });
    await updateJobStatus(client, jobId, { progress: 60 });

    // Generate chapter titles via LLM
    const llmConfig = resolveTextConfig(data.llmConfig);
    const textLlm = createTextLlm(llmConfig);

    const titles = await generateChapterTitles(
      chapters,
      analyses,
      transcriptCues,
      async (prompt) => {
        const res = await textLlm.call(prompt);
        return res.text;
      },
    );
    await updateJobStatus(client, jobId, { progress: 80 });

    // Store chapters and marks
    if (data.force) {
      await deleteSignificantMarksForVideo(client, data.videoId);
    }

    const source = `auto:${llmConfig.textProvider}`;
    await replaceAutoChapters(client, {
      video_id: data.videoId,
      transcript_id: transcriptId,
      source,
      chapters: chapters.map((ch, idx) => ({
        start_ms: ch.start_ms,
        end_ms: ch.end_ms,
        title: titles[idx] ?? `Section ${idx + 1}`,
        signals: ch.signals,
        confidence: ch.confidence,
      })),
    });

    // Store remaining marks as significant marks
    await insertSignificantMarks(
      client,
      data.videoId,
      remainingMarks.map((m) => ({
        timestamp_ms: m.timestamp_ms,
        mark_type: signalToMarkType(m.signal),
        confidence: m.confidence,
        description: null,
        metadata_json: m.metadata,
      })),
    );

    await updateJobStatus(client, jobId, {
      status: "completed",
      progress: 100,
      output_json: {
        video_id: data.videoId,
        chapters: chapters.length,
        marks: remainingMarks.length,
        candidates: allCandidates.length,
        provider: llmConfig.textProvider,
        trace_id: data.trace_id ?? null,
      },
    });
    await addJobLog(client, jobId, { message: "Auto-chapter detection completed" });
  } catch (err: any) {
    await updateJobStatus(client, jobId, { status: "failed", progress: 100, error: String(err?.message || err) });
    await addJobLog(client, jobId, { level: "error", message: "Auto-chapter detection failed", data_json: { error: String(err?.message || err) } });
  } finally {
    client.release();
  }
}

function signalToMarkType(signal: string): string {
  const mapping: Record<string, string> = {
    visual_transition: "visual_transition",
    ocr_change: "text_appears",
    topic_shift: "topic_shift",
    speaker_change: "speaker_change",
    phash_jump: "visual_transition",
  };
  return mapping[signal] ?? "topic_shift";
}
