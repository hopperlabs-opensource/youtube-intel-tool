import path from "path";
import { getPool } from "@yt/core";
import {
  addJobLog,
  updateJobStatus,
  getVideoById,
  hashText,
  createEmbedderFromEnv,
} from "@yt/core";
import {
  extractFrames,
  analyzeFrames,
  buildChunksFromFrameAnalyses,
  ensureVideoFile,
  createFrameStore,
  buildVisualCacheKey,
  createVisionProvider,
} from "@yt/core";
import {
  insertFrames,
  insertFrameAnalyses,
  insertFrameChunks,
  upsertVisualJobMeta,
  getVisualJobMeta,
  deleteVisualDataForVideo,
  insertVisualEmbedding,
} from "@yt/core";
import { listCuesByTranscript, getLatestTranscriptForVideo } from "@yt/core";
import type { VisionConfig, FrameExtractionConfig } from "@yt/contracts";

export type IngestVisualJobData = {
  videoId: string;
  extraction?: Partial<FrameExtractionConfig>;
  vision: VisionConfig;
  force?: boolean;
  trace_id?: string;
};

export async function runIngestVisual(jobId: string, data: IngestVisualJobData) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await updateJobStatus(client, jobId, { status: "running", progress: 0 });
    await addJobLog(client, jobId, { message: "Visual ingest started", data_json: data });

    const video = await getVideoById(client, data.videoId);
    if (!video) {
      await updateJobStatus(client, jobId, { status: "failed", error: "Video not found", progress: 100 });
      return;
    }

    const extractionConfig = {
      strategy: data.extraction?.strategy ?? "scene_detect",
      framesPerMinute: data.extraction?.framesPerMinute ?? 2,
      sceneThreshold: data.extraction?.sceneThreshold ?? 0.27,
      maxFrames: data.extraction?.maxFrames ?? 200,
      maxWidth: data.extraction?.maxWidth ?? 1280,
      outputFormat: data.extraction?.outputFormat ?? "jpg",
      outputQuality: data.extraction?.outputQuality ?? 85,
      minSharpness: data.extraction?.minSharpness ?? 15,
      blankThreshold: data.extraction?.blankThreshold ?? 20,
      adaptiveThreshold: data.extraction?.adaptiveThreshold ?? false,
    } as const;

    // ── Cache check ──────────────────────────────────────────────────────
    if (!data.force) {
      const existingMeta = await getVisualJobMeta(client, video.id);
      if (existingMeta?.completed_at) {
        const cacheKey = await buildVisualCacheKey({
          videoPath: video.url,
          extractionConfig,
          visionConfig: { provider: data.vision.provider, model: data.vision.model },
        });
        if (existingMeta.cache_key === cacheKey) {
          await addJobLog(client, jobId, { message: "Visual data up-to-date (cache hit), skipping" });
          await updateJobStatus(client, jobId, {
            status: "completed",
            progress: 100,
            output_json: { video_id: video.id, cache_hit: true },
          });
          return;
        }
      }
    }

    // Force: clear existing visual data
    if (data.force) {
      await addJobLog(client, jobId, { message: "Force mode: clearing existing visual data" });
      await deleteVisualDataForVideo(client, video.id);
    }

    // Record job meta start
    await upsertVisualJobMeta(client, {
      video_id: video.id,
      extraction_strategy: extractionConfig.strategy,
      frames_per_minute: extractionConfig.framesPerMinute,
      scene_threshold: extractionConfig.sceneThreshold,
      vision_provider: data.vision.provider,
      vision_model: data.vision.model,
      started_at: new Date().toISOString(),
    });

    // ── Step 1: Download video ───────────────────────────────────────────
    await addJobLog(client, jobId, { message: "Downloading video" });
    const videoPath = await ensureVideoFile(video.url, { maxHeight: 720 });
    await updateJobStatus(client, jobId, { progress: 10 });

    // ── Step 2: Extract frames ───────────────────────────────────────────
    await addJobLog(client, jobId, { message: "Extracting frames", data_json: extractionConfig });
    const frameStore = createFrameStore();
    const outputDir = path.join(process.cwd(), ".run", "frames", video.id);
    const extractedFrames = await extractFrames(videoPath, outputDir, extractionConfig);

    await addJobLog(client, jobId, {
      message: `Extracted ${extractedFrames.length} frames`,
      data_json: { frames: extractedFrames.length },
    });

    // Insert frame metadata
    await insertFrames(
      client,
      video.id,
      extractedFrames.map((f) => ({
        frame_index: f.frameIndex,
        timestamp_ms: f.timestampMs,
        file_path: f.filePath,
        width: f.width ?? null,
        height: f.height ?? null,
        file_size_bytes: f.fileSizeBytes ?? null,
        extraction_method: f.extractionMethod,
        scene_score: f.sceneScore ?? null,
        sharpness: f.sharpness ?? null,
        is_blank: f.isBlank,
      })),
    );

    // Read back frame rows to get UUIDs
    const { getFramesByVideo } = await import("@yt/core");
    const frameRows = await getFramesByVideo(client, video.id, { limit: 2000 });
    const frameIdByIndex = new Map(frameRows.map((f) => [f.frame_index, f.id]));

    await updateJobStatus(client, jobId, { progress: 30 });

    // ── Step 3: Analyze frames with vision LLM ───────────────────────────
    await addJobLog(client, jobId, {
      message: "Analyzing frames",
      data_json: { provider: data.vision.provider, model: data.vision.model },
    });

    const visionProvider = createVisionProvider(data.vision);

    // Load transcript cues for audio-visual alignment
    let transcriptCues: any[] = [];
    try {
      const transcript = await getLatestTranscriptForVideo(client, video.id, { language: "en" });
      if (transcript) {
        const cuesRes = await listCuesByTranscript(client, transcript.id, { cursorIdx: 0, limit: 5000 });
        transcriptCues = cuesRes.cues;
      }
    } catch {
      // Transcript may not exist
    }

    const frameAnalyses = await analyzeFrames({
      frames: extractedFrames,
      provider: visionProvider,
      transcriptCues,
      contextCarryover: data.vision.contextCarryover ?? true,
      maxTokensPerFrame: data.vision.maxTokensPerFrame ?? 512,
      temperature: data.vision.temperature ?? 0.2,
      retry: {
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        onRetry: (attempt, error, delayMs) => {
          addJobLog(client, jobId, {
            level: "warn",
            message: `Vision API retry ${attempt}: ${error.message} (waiting ${delayMs}ms)`,
          }).catch(() => {});
        },
      },
      onProgress: (completed, total) => {
        const progress = 30 + Math.floor((completed / total) * 40);
        updateJobStatus(client, jobId, { progress }).catch(() => {});
      },
    });

    await addJobLog(client, jobId, {
      message: `Analyzed ${frameAnalyses.length} frames`,
      data_json: { analyzed: frameAnalyses.length },
    });

    // Insert frame analyses with frame UUIDs
    await insertFrameAnalyses(
      client,
      video.id,
      frameAnalyses.map((a) => ({
        frame_id: frameIdByIndex.get(a.frameIndex) || "",
        start_ms: a.startMs,
        end_ms: a.endMs,
        description: a.description,
        objects: a.objects,
        text_overlay: a.textOverlay,
        scene_type: a.sceneType,
        provider: a.provider,
        model: a.model,
        prompt_tokens: a.promptTokens,
        completion_tokens: a.completionTokens,
      })).filter((a) => a.frame_id),
    );

    await updateJobStatus(client, jobId, { progress: 70 });

    // ── Step 4: Build frame chunks + embeddings ──────────────────────────
    await addJobLog(client, jobId, { message: "Building frame chunks" });
    const frameChunks = buildChunksFromFrameAnalyses(frameAnalyses);
    const chunkIds = await insertFrameChunks(
      client,
      video.id,
      frameChunks.map((c) => ({
        chunk_index: c.chunkIndex,
        start_ms: c.startMs,
        end_ms: c.endMs,
        text: c.text,
        token_estimate: c.tokenEstimate,
      })),
    );

    await addJobLog(client, jobId, {
      message: `Built ${frameChunks.length} frame chunks`,
      data_json: { chunks: frameChunks.length },
    });

    await updateJobStatus(client, jobId, { progress: 80 });

    // Embeddings (optional, same as transcript embedding pipeline)
    let embeddingsCount = 0;
    try {
      const embedder = createEmbedderFromEnv();
      await addJobLog(client, jobId, {
        message: "Building visual embeddings",
        data_json: { model_id: embedder.model_id },
      });

      for (let i = 0; i < frameChunks.length; i++) {
        const embedding = await embedder.embed(frameChunks[i].text);
        if (embedding.length !== 768) throw new Error(`Embedding dims mismatch: got ${embedding.length}`);
        await insertVisualEmbedding(client, {
          video_id: video.id,
          frame_chunk_id: chunkIds[i],
          model_id: embedder.model_id,
          dimensions: embedding.length,
          embedding,
          text_hash: hashText(frameChunks[i].text),
        });
        embeddingsCount++;
      }

      await addJobLog(client, jobId, {
        message: `Visual embeddings stored: ${embeddingsCount}`,
        data_json: { embeddings: embeddingsCount },
      });
    } catch (e: any) {
      await addJobLog(client, jobId, {
        level: "warn",
        message: "Visual embeddings skipped/failed",
        data_json: { error: String(e?.message || e) },
      });
    }

    // ── Finalize ─────────────────────────────────────────────────────────
    const totalTokens = frameAnalyses.reduce(
      (sum, a) => sum + (a.promptTokens ?? 0) + (a.completionTokens ?? 0),
      0,
    );

    const cacheKey = await buildVisualCacheKey({
      videoPath: video.url,
      extractionConfig,
      visionConfig: { provider: data.vision.provider, model: data.vision.model },
    });

    await upsertVisualJobMeta(client, {
      video_id: video.id,
      extraction_strategy: extractionConfig.strategy,
      frames_per_minute: extractionConfig.framesPerMinute,
      scene_threshold: extractionConfig.sceneThreshold,
      vision_provider: data.vision.provider,
      vision_model: data.vision.model,
      total_frames_extracted: extractedFrames.length,
      total_frames_analyzed: frameAnalyses.length,
      total_tokens_used: totalTokens,
      cache_key: cacheKey,
      started_at: null, // Keep existing started_at
      completed_at: new Date().toISOString(),
    });

    await updateJobStatus(client, jobId, {
      status: "completed",
      progress: 100,
      output_json: {
        video_id: video.id,
        frames_extracted: extractedFrames.length,
        frames_analyzed: frameAnalyses.length,
        frame_chunks: frameChunks.length,
        visual_embeddings: embeddingsCount,
        total_tokens: totalTokens,
        vision_provider: data.vision.provider,
        vision_model: data.vision.model,
        trace_id: data.trace_id ?? null,
      },
    });

    await addJobLog(client, jobId, { message: "Visual ingest completed" });
  } catch (err: any) {
    await updateJobStatus(client, jobId, {
      status: "failed",
      progress: 100,
      error: String(err?.message || err),
    });
    await addJobLog(client, jobId, {
      level: "error",
      message: "Visual ingest failed",
      data_json: { error: String(err?.message || err) },
    });
  } finally {
    client.release();
  }
}
