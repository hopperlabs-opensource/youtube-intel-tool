import test from "node:test";
import assert from "node:assert/strict";
import { detectChapterBoundaries } from "../src/chapters/detect";
import type { BoundaryCandidate } from "../src/chapters/signals";

function makeCandidate(
  timestamp_ms: number,
  signal: "visual_transition" | "ocr_change" | "topic_shift" | "speaker_change" | "phash_jump",
  confidence: number = 0.7,
): BoundaryCandidate {
  return { timestamp_ms, signal, confidence };
}

// ─── detectChapterBoundaries ──────────────────────────────────────────────────

test("empty candidates returns empty chapters and marks", () => {
  const result = detectChapterBoundaries([]);
  assert.deepEqual(result.chapters, []);
  assert.deepEqual(result.remainingMarks, []);
});

test("two signals at same timestamp create a boundary", () => {
  const candidates = [
    makeCandidate(10000, "visual_transition"),
    makeCandidate(10000, "ocr_change"),
  ];
  const result = detectChapterBoundaries(candidates, { minSignals: 2, totalDurationMs: 60000 });
  assert.ok(result.chapters.length >= 1);
  // Should have a chapter starting at 0 (prepended) and one at 10000
  const nonPrepended = result.chapters.filter((c) => c.start_ms > 0);
  assert.ok(nonPrepended.length >= 1);
  assert.equal(nonPrepended[0].start_ms, 10000);
});

test("single signal alone becomes a remaining mark, not a boundary", () => {
  const candidates = [makeCandidate(10000, "visual_transition")];
  const result = detectChapterBoundaries(candidates, { minSignals: 2 });
  assert.equal(result.chapters.length, 0);
  assert.equal(result.remainingMarks.length, 1);
  assert.equal(result.remainingMarks[0].timestamp_ms, 10000);
});

test("signals within window_ms merge into one cluster", () => {
  const candidates = [
    makeCandidate(10000, "visual_transition"),
    makeCandidate(10500, "ocr_change"),    // within 3000ms window
    makeCandidate(11000, "topic_shift"),   // within 3000ms window
  ];
  const result = detectChapterBoundaries(candidates, {
    minSignals: 2,
    windowMs: 3000,
    totalDurationMs: 60000,
  });
  // All 3 signals should merge into one cluster
  assert.ok(result.chapters.length >= 1);
  assert.equal(result.remainingMarks.length, 0);
});

test("signals outside window_ms stay separate", () => {
  const candidates = [
    makeCandidate(10000, "visual_transition"),
    makeCandidate(20000, "ocr_change"), // 10s apart, outside 3000ms window
  ];
  const result = detectChapterBoundaries(candidates, {
    minSignals: 2,
    windowMs: 3000,
  });
  // Neither cluster has 2 distinct signals, both become marks
  assert.equal(result.chapters.length, 0);
  assert.equal(result.remainingMarks.length, 2);
});

test("minSignals=3 requires 3 distinct signal types", () => {
  const candidates = [
    makeCandidate(10000, "visual_transition"),
    makeCandidate(10100, "ocr_change"),
  ];
  const result = detectChapterBoundaries(candidates, { minSignals: 3, windowMs: 3000 });
  // Only 2 distinct signals, not enough for minSignals=3
  assert.equal(result.chapters.length, 0);
  assert.equal(result.remainingMarks.length, 2);

  // Now add a third signal
  candidates.push(makeCandidate(10200, "topic_shift"));
  const result2 = detectChapterBoundaries(candidates, { minSignals: 3, windowMs: 3000 });
  assert.ok(result2.chapters.length >= 1);
});

test("first chapter is prepended at 0 if boundaries start later", () => {
  const candidates = [
    makeCandidate(30000, "visual_transition"),
    makeCandidate(30100, "ocr_change"),
  ];
  const result = detectChapterBoundaries(candidates, {
    minSignals: 2,
    windowMs: 3000,
    totalDurationMs: 120000,
  });
  assert.ok(result.chapters.length >= 2);
  assert.equal(result.chapters[0].start_ms, 0);
  assert.equal(result.chapters[0].end_ms, 30000);
});

test("multiple boundaries create sequential chapters", () => {
  const candidates = [
    makeCandidate(10000, "visual_transition"),
    makeCandidate(10100, "speaker_change"),
    makeCandidate(40000, "visual_transition"),
    makeCandidate(40200, "topic_shift"),
  ];
  const result = detectChapterBoundaries(candidates, {
    minSignals: 2,
    windowMs: 3000,
    totalDurationMs: 120000,
  });
  // Should have: [0, 10000), [10000, 40000), [40000, 120000)
  assert.ok(result.chapters.length >= 3);
  assert.equal(result.chapters[0].start_ms, 0);
  assert.equal(result.chapters[1].start_ms, 10000);
  assert.equal(result.chapters[2].start_ms, 40000);
});

test("chapters contain their constituent signals", () => {
  const candidates = [
    makeCandidate(10000, "visual_transition"),
    makeCandidate(10100, "ocr_change"),
    makeCandidate(10200, "topic_shift"),
  ];
  const result = detectChapterBoundaries(candidates, {
    minSignals: 2,
    windowMs: 3000,
    totalDurationMs: 60000,
  });
  const mainChapter = result.chapters.find((c) => c.start_ms === 10000);
  assert.ok(mainChapter);
  assert.ok(mainChapter.signals.includes("visual_transition"));
  assert.ok(mainChapter.signals.includes("ocr_change"));
  assert.ok(mainChapter.signals.includes("topic_shift"));
});
