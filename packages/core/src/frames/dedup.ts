/**
 * Frame deduplication via perceptual hashing.
 * Pattern from klippbok (Apache-2.0) and openscenesense-ollama (MIT).
 *
 * Uses average hash (aHash): resize to 8x8, grayscale, compare mean.
 * Computed via ffmpeg — no native dependencies (OpenCV, sharp, etc.).
 *
 * Skips near-duplicate frames before sending to vision LLM, saving tokens.
 */

import { execSync } from "node:child_process";
import type { ExtractedFrame } from "./extract";

/**
 * Compute a perceptual hash (average hash) for an image using ffmpeg.
 * Returns a 64-bit hex string.
 *
 * Algorithm:
 * 1. Resize to 8x8 grayscale
 * 2. Compute mean pixel value
 * 3. Each pixel: 1 if >= mean, 0 if < mean
 * 4. Pack into 64-bit hex
 */
export function computePerceptualHash(imagePath: string): string {
  try {
    // Use ffmpeg to get 8x8 grayscale pixel values
    const result = execSync(
      `ffprobe -v error -select_streams v:0 -show_entries frame=pkt_pts_time -of csv=p=0 "${imagePath}" 2>/dev/null; ` +
      `ffmpeg -v error -i "${imagePath}" -vf "scale=8:8,format=gray" -f rawvideo -pix_fmt gray - 2>/dev/null | xxd -p`,
      { encoding: "utf8", timeout: 10000 },
    ).trim();

    // Parse hex bytes to pixel values
    const hexBytes = result.split("\n").pop()?.trim() || "";
    if (hexBytes.length < 128) {
      // Fallback: use file size + dimensions as rough hash
      return fallbackHash(imagePath);
    }

    const pixels: number[] = [];
    for (let i = 0; i < 128 && i < hexBytes.length; i += 2) {
      pixels.push(parseInt(hexBytes.substring(i, i + 2), 16));
    }

    // Compute mean
    const mean = pixels.reduce((sum, p) => sum + p, 0) / pixels.length;

    // Build hash: 1 bit per pixel
    let hash = BigInt(0);
    for (let i = 0; i < 64 && i < pixels.length; i++) {
      if (pixels[i] >= mean) {
        hash |= BigInt(1) << BigInt(63 - i);
      }
    }

    return hash.toString(16).padStart(16, "0");
  } catch {
    return fallbackHash(imagePath);
  }
}

function fallbackHash(imagePath: string): string {
  // Simple fallback: hash of file size
  try {
    const stat = execSync(`stat -f%z "${imagePath}" 2>/dev/null || stat -c%s "${imagePath}" 2>/dev/null`, {
      encoding: "utf8",
      timeout: 5000,
    }).trim();
    return `fallback_${stat}`;
  } catch {
    return `fallback_${Date.now()}`;
  }
}

/**
 * Compute Hamming distance between two 64-bit hex hashes.
 * Returns number of differing bits (0 = identical, 64 = maximally different).
 */
export function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.startsWith("fallback_") || hash2.startsWith("fallback_")) {
    return hash1 === hash2 ? 0 : 64; // Can't compare fallback hashes
  }

  const a = BigInt(`0x${hash1}`);
  const b = BigInt(`0x${hash2}`);
  let xor = a ^ b;
  let count = 0;
  while (xor > BigInt(0)) {
    count += Number(xor & BigInt(1));
    xor >>= BigInt(1);
  }
  return count;
}

export interface DedupResult {
  /** Frames that passed dedup (unique enough to analyze) */
  unique: ExtractedFrame[];
  /** Frames that were filtered as duplicates */
  duplicates: ExtractedFrame[];
  /** Map from frame index to its perceptual hash */
  hashes: Map<number, string>;
}

/**
 * Filter near-duplicate frames using perceptual hashing.
 *
 * @param frames - Extracted frames sorted by timestamp
 * @param threshold - Hamming distance threshold (0-64). Frames with distance
 *   below this from any previously accepted frame are considered duplicates.
 *   Default: 5 (very similar frames filtered, but different angles/zooms kept).
 */
export function deduplicateFrames(
  frames: ExtractedFrame[],
  threshold: number = 5,
): DedupResult {
  const hashes = new Map<number, string>();
  const unique: ExtractedFrame[] = [];
  const duplicates: ExtractedFrame[] = [];
  const acceptedHashes: string[] = [];

  for (const frame of frames) {
    const hash = computePerceptualHash(frame.filePath);
    hashes.set(frame.frameIndex, hash);

    // Check against all accepted frames
    let isDuplicate = false;
    for (const accepted of acceptedHashes) {
      if (hammingDistance(hash, accepted) < threshold) {
        isDuplicate = true;
        break;
      }
    }

    if (isDuplicate) {
      duplicates.push(frame);
    } else {
      unique.push(frame);
      acceptedHashes.push(hash);
    }
  }

  return { unique, duplicates, hashes };
}
