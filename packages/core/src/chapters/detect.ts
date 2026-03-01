import type { ChapterSignal } from "@yt/contracts";
import type { BoundaryCandidate } from "./signals";

export interface DetectedBoundary {
  timestamp_ms: number;
  signals: ChapterSignal[];
  confidence: number;
}

export interface DetectedChapter {
  start_ms: number;
  end_ms: number;
  signals: ChapterSignal[];
  confidence: number;
}

export interface DetectChapterOpts {
  minSignals?: number;
  windowMs?: number;
  totalDurationMs?: number;
}

/**
 * Multi-signal voting algorithm for chapter boundary detection.
 *
 * Sort all candidates by timestamp. Slide window of ±windowMs.
 * Confirm boundary where ≥ minSignals distinct signal types agree.
 * Merge nearby boundaries. Remaining unmerged candidates become significant marks.
 */
export function detectChapterBoundaries(
  candidates: BoundaryCandidate[],
  opts?: DetectChapterOpts,
): { chapters: DetectedChapter[]; remainingMarks: BoundaryCandidate[] } {
  const minSignals = opts?.minSignals ?? 2;
  const windowMs = opts?.windowMs ?? 3000;
  const totalDurationMs = opts?.totalDurationMs ?? 0;

  if (candidates.length === 0) {
    return { chapters: [], remainingMarks: [] };
  }

  const sorted = [...candidates].sort((a, b) => a.timestamp_ms - b.timestamp_ms);

  // Group candidates into clusters within windowMs
  const clusters: Array<{
    center_ms: number;
    signals: Set<ChapterSignal>;
    confidence: number;
    candidates: BoundaryCandidate[];
  }> = [];

  const used = new Set<number>();

  for (let i = 0; i < sorted.length; i++) {
    if (used.has(i)) continue;

    const cluster = {
      center_ms: sorted[i].timestamp_ms,
      signals: new Set<ChapterSignal>([sorted[i].signal]),
      confidence: sorted[i].confidence,
      candidates: [sorted[i]],
    };
    used.add(i);

    // Find all candidates within window
    for (let j = i + 1; j < sorted.length; j++) {
      if (used.has(j)) continue;
      if (Math.abs(sorted[j].timestamp_ms - cluster.center_ms) <= windowMs) {
        cluster.signals.add(sorted[j].signal);
        cluster.confidence = Math.max(cluster.confidence, sorted[j].confidence);
        cluster.candidates.push(sorted[j]);
        used.add(j);
      }
    }

    clusters.push(cluster);
  }

  // Separate confirmed boundaries (≥ minSignals) from remaining marks
  const boundaries: DetectedBoundary[] = [];
  const remainingMarks: BoundaryCandidate[] = [];

  for (const cluster of clusters) {
    if (cluster.signals.size >= minSignals) {
      boundaries.push({
        timestamp_ms: cluster.center_ms,
        signals: Array.from(cluster.signals),
        confidence: cluster.confidence,
      });
    } else {
      remainingMarks.push(...cluster.candidates);
    }
  }

  // Convert boundaries to chapters
  const sortedBoundaries = boundaries.sort((a, b) => a.timestamp_ms - b.timestamp_ms);
  const chapters: DetectedChapter[] = [];

  for (let i = 0; i < sortedBoundaries.length; i++) {
    const start_ms = sortedBoundaries[i].timestamp_ms;
    const end_ms = i + 1 < sortedBoundaries.length
      ? sortedBoundaries[i + 1].timestamp_ms
      : (totalDurationMs || start_ms + 60000);

    chapters.push({
      start_ms,
      end_ms,
      signals: sortedBoundaries[i].signals,
      confidence: sortedBoundaries[i].confidence,
    });
  }

  // If we have chapters and the first one doesn't start at 0, prepend one
  if (chapters.length > 0 && chapters[0].start_ms > 0) {
    chapters.unshift({
      start_ms: 0,
      end_ms: chapters[0].start_ms,
      signals: [],
      confidence: 0.5,
    });
  }

  return { chapters, remainingMarks };
}
