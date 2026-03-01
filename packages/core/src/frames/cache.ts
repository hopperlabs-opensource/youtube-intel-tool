import crypto from "crypto";
import fs from "fs/promises";

/**
 * Build a SHA256 cache key from video file metadata + extraction/vision config.
 * Pattern from openscenesense-ollama.
 */
export async function buildVisualCacheKey(opts: {
  videoPath: string;
  extractionConfig: Record<string, unknown>;
  visionConfig: Record<string, unknown>;
}): Promise<string> {
  let fileMeta: { size: number; mtimeMs: number };
  try {
    const stat = await fs.stat(opts.videoPath);
    fileMeta = { size: stat.size, mtimeMs: Math.floor(stat.mtimeMs) };
  } catch {
    fileMeta = { size: 0, mtimeMs: 0 };
  }

  const payload = JSON.stringify({
    path: opts.videoPath,
    ...fileMeta,
    extraction: opts.extractionConfig,
    vision: opts.visionConfig,
  });

  return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
}
