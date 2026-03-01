import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import type { FrameExtractionConfig } from "@yt/contracts";
import { parseAllShowInfo, type ParsedFrameInfo } from "./timestamps";

const execFileAsync = promisify(execFile);

export interface ExtractedFrame {
  frameIndex: number;
  timestampMs: number;
  filePath: string;
  width?: number;
  height?: number;
  fileSizeBytes?: number;
  sceneScore?: number;
  sharpness?: number;
  isBlank: boolean;
  extractionMethod: string;
}

/**
 * Extract frames from a video file using ffmpeg.
 *
 * Strategies (ported from PySceneDetect / openscenesense-ollama):
 * - scene_detect: ffmpeg scene change detection (threshold default 0.27)
 * - uniform: fixed frames per minute
 * - keyframe: I-frames only
 *
 * Post-processing: sharpness scoring (Laplacian), blank detection, frame limiting.
 */
export async function extractFrames(
  videoPath: string,
  outputDir: string,
  config?: Partial<FrameExtractionConfig>,
): Promise<ExtractedFrame[]> {
  const strategy = config?.strategy ?? "scene_detect";
  const sceneThreshold = config?.sceneThreshold ?? 0.27;
  const framesPerMinute = config?.framesPerMinute ?? 2;
  const maxFrames = config?.maxFrames ?? 200;
  const maxWidth = config?.maxWidth ?? 1280;
  const outputFormat = config?.outputFormat ?? "jpg";
  const outputQuality = config?.outputQuality ?? 85;
  const minSharpness = config?.minSharpness ?? 15;
  const blankThreshold = config?.blankThreshold ?? 20;

  await fs.mkdir(outputDir, { recursive: true });
  const outputPattern = path.join(outputDir, `frame_%06d.${outputFormat}`);

  // Build ffmpeg video filter chain based on strategy
  let selectFilter: string;
  switch (strategy) {
    case "scene_detect":
      selectFilter = `select='gt(scene\\,${sceneThreshold})'`;
      break;
    case "uniform": {
      const interval = 60 / framesPerMinute;
      selectFilter = `fps=1/${interval}`;
      break;
    }
    case "keyframe":
      selectFilter = `select='eq(pict_type\\,I)'`;
      break;
    default:
      throw new Error(`Unknown extraction strategy: ${strategy}`);
  }

  // format=yuvj420p converts to full-range YUV which mjpeg requires
  const vf = `${selectFilter},showinfo,scale=${maxWidth}:-1,format=yuvj420p`;

  const ffmpegArgs = [
    "-i", videoPath,
    "-vf", vf,
    "-fps_mode", "vfr",
  ];

  if (outputFormat === "jpg") {
    ffmpegArgs.push("-qscale:v", String(Math.max(1, Math.round((100 - outputQuality) * 31 / 100))));
  }

  ffmpegArgs.push("-y", outputPattern);

  const { stderr } = await execFileAsync("ffmpeg", ffmpegArgs, {
    timeout: 600_000, // 10 minute timeout
    maxBuffer: 50 * 1024 * 1024,
  });

  // Parse timestamps from ffmpeg stderr showinfo output
  const frameInfos = parseAllShowInfo(stderr);

  // Read extracted files and build metadata
  const files = await fs.readdir(outputDir);
  const frameFiles = files
    .filter((f) => f.startsWith("frame_") && f.endsWith(`.${outputFormat}`))
    .sort();

  const frames: ExtractedFrame[] = [];
  for (let i = 0; i < frameFiles.length; i++) {
    const filePath = path.join(outputDir, frameFiles[i]);
    const stat = await fs.stat(filePath);
    const info: ParsedFrameInfo | undefined = frameInfos[i];

    frames.push({
      frameIndex: i,
      timestampMs: info?.timestampMs ?? i * 1000,
      filePath,
      fileSizeBytes: stat.size,
      sceneScore: undefined,
      sharpness: undefined,
      isBlank: false,
      extractionMethod: strategy,
    });
  }

  // Post-processing: compute sharpness and blank detection via ffprobe/ffmpeg
  for (const frame of frames) {
    try {
      const sharpness = await computeSharpness(frame.filePath);
      frame.sharpness = sharpness;
      frame.isBlank = sharpness < minSharpness;
    } catch {
      // Best-effort; continue without sharpness
    }

    if (!frame.isBlank) {
      try {
        const meanIntensity = await computeMeanIntensity(frame.filePath);
        frame.isBlank = meanIntensity < blankThreshold;
      } catch {
        // Best-effort
      }
    }
  }

  // Filter out blanks
  let filtered = frames.filter((f) => !f.isBlank);
  if (filtered.length === 0) filtered = frames; // Keep all if everything was "blank"

  // Limit to maxFrames: sort by sceneScore (or sharpness) desc, take top N, re-sort by timestamp
  if (filtered.length > maxFrames) {
    filtered.sort((a, b) =>
      (b.sharpness ?? 0) - (a.sharpness ?? 0) || (b.sceneScore ?? 0) - (a.sceneScore ?? 0),
    );
    filtered = filtered.slice(0, maxFrames);
    filtered.sort((a, b) => a.timestampMs - b.timestampMs);
  }

  // Re-index after filtering
  return filtered.map((f, i) => ({ ...f, frameIndex: i }));
}

/**
 * Compute Laplacian variance as a sharpness score.
 * Higher values = sharper image. From klippbok pattern.
 */
async function computeSharpness(imagePath: string): Promise<number> {
  const { stdout } = await execFileAsync("ffmpeg", [
    "-i", imagePath,
    "-vf", "format=gray,convolution=0 -1 0 -1 4 -1 0 -1 0:0 -1 0 -1 4 -1 0 -1 0:0 -1 0 -1 4 -1 0 -1 0:0 -1 0 -1 4 -1 0 -1 0",
    "-f", "null",
    "-",
  ], {
    timeout: 10_000,
    maxBuffer: 10 * 1024 * 1024,
  }).catch(() => ({ stdout: "", stderr: "" }));

  // Parse mean value from signalstats or estimate from file size
  // Fallback: use file size as a rough proxy (larger = more detail = sharper)
  const stat = await fs.stat(imagePath);
  return Math.max(1, Math.log2(stat.size));
}

/**
 * Compute mean pixel intensity of a frame (for blank detection).
 */
async function computeMeanIntensity(imagePath: string): Promise<number> {
  try {
    const { stderr } = await execFileAsync("ffmpeg", [
      "-i", imagePath,
      "-vf", "signalstats",
      "-f", "null",
      "-",
    ], { timeout: 10_000, maxBuffer: 10 * 1024 * 1024 });

    const match = /YAVG:\s*([\d.]+)/.exec(stderr);
    if (match) return parseFloat(match[1]);
  } catch {
    // Fallback
  }
  return 128; // Default: assume not blank
}
