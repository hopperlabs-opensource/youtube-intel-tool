import type { FrameAnalysisRow, ChapterSignal } from "@yt/contracts";

export interface BoundaryCandidate {
  timestamp_ms: number;
  signal: ChapterSignal;
  confidence: number;
  metadata?: Record<string, unknown>;
}

/**
 * Detect visual transitions from scene_type changes or scene_score jumps.
 */
export function detectVisualTransitions(
  analyses: FrameAnalysisRow[],
): BoundaryCandidate[] {
  if (analyses.length < 2) return [];

  const sorted = [...analyses].sort((a, b) => a.start_ms - b.start_ms);
  const candidates: BoundaryCandidate[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];

    if (prev.scene_type && curr.scene_type && prev.scene_type !== curr.scene_type) {
      candidates.push({
        timestamp_ms: curr.start_ms,
        signal: "visual_transition",
        confidence: 0.7,
        metadata: { from_scene: prev.scene_type, to_scene: curr.scene_type },
      });
    }
  }

  return candidates;
}

/**
 * Detect OCR text changes (Jaccard distance > threshold).
 */
export function detectOcrChanges(
  analyses: FrameAnalysisRow[],
  threshold: number = 0.7,
): BoundaryCandidate[] {
  if (analyses.length < 2) return [];

  const sorted = [...analyses].sort((a, b) => a.start_ms - b.start_ms);
  const candidates: BoundaryCandidate[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];

    const prevText = (prev.text_overlay ?? "").trim();
    const currText = (curr.text_overlay ?? "").trim();

    // Only compare when at least one frame has text
    if (!prevText && !currText) continue;

    const jaccardDist = jaccard(tokenize(prevText), tokenize(currText));
    if (jaccardDist > threshold) {
      candidates.push({
        timestamp_ms: curr.start_ms,
        signal: "ocr_change",
        confidence: Math.min(1, jaccardDist),
        metadata: { jaccard_distance: jaccardDist },
      });
    }
  }

  return candidates;
}

/**
 * Detect topic shifts using keyword overlap between sliding windows of transcript.
 */
export function detectTopicShifts(
  cues: Array<{ start_ms: number; end_ms: number; text: string }>,
  windowSize: number = 10,
  threshold: number = 0.6,
): BoundaryCandidate[] {
  if (cues.length < windowSize * 2) return [];

  const candidates: BoundaryCandidate[] = [];

  for (let i = windowSize; i < cues.length - windowSize; i++) {
    const windowA = cues.slice(i - windowSize, i).map((c) => c.text).join(" ");
    const windowB = cues.slice(i, i + windowSize).map((c) => c.text).join(" ");

    const tokensA = tokenize(windowA);
    const tokensB = tokenize(windowB);
    const dist = jaccard(tokensA, tokensB);

    if (dist > threshold) {
      candidates.push({
        timestamp_ms: cues[i].start_ms,
        signal: "topic_shift",
        confidence: Math.min(1, dist * 0.9),
        metadata: { jaccard_distance: dist, window_size: windowSize },
      });
    }
  }

  return candidates;
}

/**
 * Detect speaker changes from consecutive speaker segments.
 */
export function detectSpeakerChanges(
  segments: Array<{ speaker_key: string; start_ms: number; end_ms: number }>,
): BoundaryCandidate[] {
  if (segments.length < 2) return [];

  const sorted = [...segments].sort((a, b) => a.start_ms - b.start_ms);
  const candidates: BoundaryCandidate[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];

    if (prev.speaker_key !== curr.speaker_key) {
      candidates.push({
        timestamp_ms: curr.start_ms,
        signal: "speaker_change",
        confidence: 0.6,
        metadata: { from_speaker: prev.speaker_key, to_speaker: curr.speaker_key },
      });
    }
  }

  return candidates;
}

/**
 * Detect perceptual hash jumps (hamming distance > threshold).
 */
export function detectPhashJumps(
  hashes: Array<{ hash: string; timestamp_ms: number }>,
  threshold: number = 12,
): BoundaryCandidate[] {
  if (hashes.length < 2) return [];

  const sorted = [...hashes].sort((a, b) => a.timestamp_ms - b.timestamp_ms);
  const candidates: BoundaryCandidate[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const dist = hammingDistance(prev.hash, curr.hash);

    if (dist > threshold) {
      candidates.push({
        timestamp_ms: curr.timestamp_ms,
        signal: "phash_jump",
        confidence: Math.min(1, dist / 32),
        metadata: { hamming_distance: dist },
      });
    }
  }

  return candidates;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 0;
  return 1 - intersection.size / union.size;
}

function hammingDistance(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  let dist = 0;
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) dist++;
  }
  return dist + Math.abs(a.length - b.length);
}
