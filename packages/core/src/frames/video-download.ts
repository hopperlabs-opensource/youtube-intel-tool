import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const execFileAsync = promisify(execFile);

/**
 * Ensure a video file exists locally. If `input` is a URL, downloads via yt-dlp.
 * If `input` is a local path, returns it as-is.
 * Downloads at 720p max to save bandwidth (vision LLMs downscale internally).
 */
export async function ensureVideoFile(input: string, opts?: {
  outputDir?: string;
  maxHeight?: number;
}): Promise<string> {
  // If it's a local file, verify it exists and return
  if (!input.startsWith("http://") && !input.startsWith("https://")) {
    await fs.access(input);
    return input;
  }

  const outputDir = opts?.outputDir || path.join(process.cwd(), ".run", "videos");
  await fs.mkdir(outputDir, { recursive: true });

  // Use a hash of the URL for the filename to allow caching
  const urlHash = crypto.createHash("sha256").update(input).digest("hex").slice(0, 16);
  const outputPath = path.join(outputDir, `${urlHash}.mp4`);

  // Skip download if cached file exists
  try {
    await fs.access(outputPath);
    return outputPath;
  } catch {
    // File doesn't exist, download it
  }

  const maxHeight = opts?.maxHeight ?? 720;
  const tmpPath = `${outputPath}.tmp`;

  try {
    await execFileAsync("yt-dlp", [
      "-f", `bestvideo[height<=${maxHeight}]+bestaudio/best[height<=${maxHeight}]`,
      "--merge-output-format", "mp4",
      "-o", tmpPath,
      "--no-playlist",
      "--no-warnings",
      input,
    ], { timeout: 300_000 }); // 5 minute timeout

    await fs.rename(tmpPath, outputPath);
  } catch (err) {
    // Clean up temp file on failure
    await fs.rm(tmpPath, { force: true });
    throw err;
  }

  return outputPath;
}
