import fs from "fs/promises";
import type { TranscriptCue } from "@yt/contracts";
import type { VisionProviderAdapter, VisionResponse } from "../vision/types";
import { buildFrameAnalysisPrompt, type PromptTemplate } from "../vision/prompt";
import { withRetry, type RetryOpts } from "../vision/retry";
import type { ExtractedFrame } from "./extract";

export interface FrameAnalysis {
  frameIndex: number;
  frameId?: string;
  timestampMs: number;
  startMs: number;
  endMs: number;
  description: string;
  objects: VisionResponse["objects"];
  textOverlay: string | null;
  sceneType: VisionResponse["sceneType"];
  provider: string;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
}

export interface AnalyzeFramesOpts {
  frames: ExtractedFrame[];
  provider: VisionProviderAdapter;
  /** Transcript cues for audio-visual alignment */
  transcriptCues?: TranscriptCue[];
  /** Inject previous frame description into next prompt (default true) */
  contextCarryover?: boolean;
  /** Max tokens per frame response */
  maxTokensPerFrame?: number;
  /** Temperature */
  temperature?: number;
  /** Progress callback */
  onProgress?: (completed: number, total: number) => void;
  /** Concurrency for parallel mode (only when contextCarryover=false) */
  concurrency?: number;
  /** Retry options for transient API failures */
  retry?: RetryOpts;
  /** Token budget — stop analyzing after this many total tokens consumed */
  tokenBudget?: number;
  /** Prompt template to use (default: "describe") */
  promptTemplate?: PromptTemplate;
}

function formatHms(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/**
 * Find transcript cues overlapping a given timestamp range.
 */
function findOverlappingCues(
  cues: TranscriptCue[],
  startMs: number,
  endMs: number,
): TranscriptCue[] {
  return cues.filter(
    (c) => c.start_ms < endMs && c.end_ms > startMs,
  );
}

/**
 * Compute the time range a frame represents.
 * The frame covers from its timestamp to the next frame's timestamp (or +5s).
 */
function computeFrameRange(
  frame: ExtractedFrame,
  nextFrame: ExtractedFrame | undefined,
): { startMs: number; endMs: number } {
  const startMs = frame.timestampMs;
  const endMs = nextFrame ? nextFrame.timestampMs : startMs + 5000;
  return { startMs, endMs };
}

/**
 * Check if a frame analysis is low-signal and should be skipped.
 * <8 tokens or <20% unique words.
 */
function isLowSignal(description: string): boolean {
  const words = description.split(/\s+/).filter(Boolean);
  if (words.length < 8) return true;

  const unique = new Set(words.map((w) => w.toLowerCase()));
  if (unique.size / words.length < 0.2) return true;

  return false;
}

/**
 * Analyze frames using a vision LLM provider.
 * Supports context carryover (sequential) and parallel modes.
 */
export async function analyzeFrames(opts: AnalyzeFramesOpts): Promise<FrameAnalysis[]> {
  const {
    frames,
    provider,
    transcriptCues = [],
    contextCarryover = true,
    maxTokensPerFrame = 512,
    temperature = 0.2,
    onProgress,
    concurrency = 3,
    retry: retryOpts,
    tokenBudget,
    promptTemplate,
  } = opts;

  const results: FrameAnalysis[] = [];
  let previousContext: string | null = null;
  let totalTokensUsed = 0;

  async function analyzeOne(
    frame: ExtractedFrame,
    nextFrame: ExtractedFrame | undefined,
    prevCtx: string | null,
  ): Promise<FrameAnalysis> {
    const { startMs, endMs } = computeFrameRange(frame, nextFrame);

    // Find overlapping transcript context
    let transcriptContext: string | null = null;
    if (transcriptCues.length > 0) {
      const overlapping = findOverlappingCues(transcriptCues, startMs, endMs);
      if (overlapping.length > 0) {
        transcriptContext = overlapping.map((c) => c.text).join(" ").slice(0, 500);
      }
    }

    const prompt = buildFrameAnalysisPrompt({
      previousContext: prevCtx,
      transcriptContext,
      timestamp: formatHms(frame.timestampMs),
      template: promptTemplate,
    });

    // Read image as base64
    const imageData = await fs.readFile(frame.filePath);
    const imageBase64 = imageData.toString("base64");
    const mimeType = frame.filePath.endsWith(".png") ? "image/png" as const : "image/jpeg" as const;

    const response = await withRetry(
      () => provider.analyze({
        imageBase64,
        mimeType,
        prompt,
        maxTokens: maxTokensPerFrame,
        temperature,
      }),
      retryOpts,
    );

    return {
      frameIndex: frame.frameIndex,
      timestampMs: frame.timestampMs,
      startMs,
      endMs,
      description: response.description,
      objects: response.objects,
      textOverlay: response.textOverlay,
      sceneType: response.sceneType,
      provider: provider.name,
      model: provider.model,
      promptTokens: response.promptTokens,
      completionTokens: response.completionTokens,
    };
  }

  if (contextCarryover) {
    // Sequential: each frame gets previous frame's description as context
    for (let i = 0; i < frames.length; i++) {
      // Token budget check
      if (tokenBudget && totalTokensUsed >= tokenBudget) {
        break;
      }

      const result = await analyzeOne(frames[i], frames[i + 1], previousContext);
      totalTokensUsed += (result.promptTokens ?? 0) + (result.completionTokens ?? 0);

      // Skip low-signal frames (but still report progress)
      if (!isLowSignal(result.description)) {
        results.push(result);
        previousContext = result.description;
      }

      onProgress?.(i + 1, frames.length);
    }
  } else {
    // Parallel: process frames in batches
    for (let i = 0; i < frames.length; i += concurrency) {
      // Token budget check
      if (tokenBudget && totalTokensUsed >= tokenBudget) {
        break;
      }

      const batch = frames.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((frame, j) =>
          analyzeOne(frame, frames[i + j + 1], null),
        ),
      );

      for (const result of batchResults) {
        totalTokensUsed += (result.promptTokens ?? 0) + (result.completionTokens ?? 0);
        if (!isLowSignal(result.description)) {
          results.push(result);
        }
      }

      onProgress?.(Math.min(i + concurrency, frames.length), frames.length);
    }
  }

  return results;
}
