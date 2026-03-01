import test from "node:test";
import assert from "node:assert/strict";
import {
  detectVisualTransitions,
  detectOcrChanges,
  detectTopicShifts,
  detectSpeakerChanges,
  detectPhashJumps,
} from "../src/chapters/signals";

import type { FrameAnalysisRow } from "@yt/contracts";

function makeAnalysis(overrides: Partial<FrameAnalysisRow>): FrameAnalysisRow {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    video_id: "00000000-0000-0000-0000-000000000001",
    frame_id: "00000000-0000-0000-0000-000000000002",
    start_ms: 0,
    end_ms: 1000,
    description: "test frame",
    objects: [],
    text_overlay: null,
    scene_type: null,
    provider: "test",
    model: "test-model",
    prompt_tokens: null,
    completion_tokens: null,
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

// ─── detectVisualTransitions ─────────────────────────────────────────────────

test("detectVisualTransitions: no transitions with same scene_type", () => {
  const analyses = [
    makeAnalysis({ start_ms: 0, end_ms: 1000, scene_type: "talking_head" }),
    makeAnalysis({ start_ms: 1000, end_ms: 2000, scene_type: "talking_head" }),
    makeAnalysis({ start_ms: 2000, end_ms: 3000, scene_type: "talking_head" }),
  ];
  assert.equal(detectVisualTransitions(analyses).length, 0);
});

test("detectVisualTransitions: detects scene_type change", () => {
  const analyses = [
    makeAnalysis({ start_ms: 0, end_ms: 5000, scene_type: "talking_head" }),
    makeAnalysis({ start_ms: 5000, end_ms: 10000, scene_type: "presentation" }),
    makeAnalysis({ start_ms: 10000, end_ms: 15000, scene_type: "screencast" }),
  ];
  const candidates = detectVisualTransitions(analyses);
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].signal, "visual_transition");
  assert.equal(candidates[0].timestamp_ms, 5000);
  assert.equal(candidates[1].timestamp_ms, 10000);
});

test("detectVisualTransitions: ignores null scene_types", () => {
  const analyses = [
    makeAnalysis({ start_ms: 0, end_ms: 5000, scene_type: "talking_head" }),
    makeAnalysis({ start_ms: 5000, end_ms: 10000, scene_type: null }),
    makeAnalysis({ start_ms: 10000, end_ms: 15000, scene_type: "presentation" }),
  ];
  const candidates = detectVisualTransitions(analyses);
  assert.equal(candidates.length, 0);
});

test("detectVisualTransitions: empty/single input returns empty", () => {
  assert.deepEqual(detectVisualTransitions([]), []);
  assert.deepEqual(detectVisualTransitions([makeAnalysis({})]), []);
});

// ─── detectOcrChanges ────────────────────────────────────────────────────────

test("detectOcrChanges: detects major text overlay change", () => {
  const analyses = [
    makeAnalysis({ start_ms: 0, end_ms: 5000, text_overlay: "Introduction to Machine Learning" }),
    makeAnalysis({ start_ms: 5000, end_ms: 10000, text_overlay: "Deep Neural Networks Architecture" }),
  ];
  const candidates = detectOcrChanges(analyses);
  assert.ok(candidates.length > 0);
  assert.equal(candidates[0].signal, "ocr_change");
});

test("detectOcrChanges: no change with similar text", () => {
  const analyses = [
    makeAnalysis({ start_ms: 0, end_ms: 5000, text_overlay: "Introduction to Machine Learning" }),
    makeAnalysis({ start_ms: 5000, end_ms: 10000, text_overlay: "Introduction to Machine Learning basics" }),
  ];
  const candidates = detectOcrChanges(analyses);
  assert.equal(candidates.length, 0);
});

test("detectOcrChanges: skips when both null", () => {
  const analyses = [
    makeAnalysis({ start_ms: 0, end_ms: 5000, text_overlay: null }),
    makeAnalysis({ start_ms: 5000, end_ms: 10000, text_overlay: null }),
  ];
  assert.equal(detectOcrChanges(analyses).length, 0);
});

// ─── detectTopicShifts ───────────────────────────────────────────────────────

test("detectTopicShifts: detects shift between different topics", () => {
  // Create 25 cues: first 12 about cooking, last 13 about astronomy
  const cookingWords = ["recipe", "ingredients", "cooking", "stir", "oven", "bake", "flour", "sugar", "bowl", "mix"];
  const astronomyWords = ["stars", "planet", "galaxy", "telescope", "orbit", "cosmos", "universe", "nebula", "comet", "asteroid"];

  const cues = Array.from({ length: 25 }, (_, i) => {
    const words = i < 12 ? cookingWords : astronomyWords;
    return {
      start_ms: i * 5000,
      end_ms: (i + 1) * 5000,
      text: `Let me tell you about ${words[i % words.length]} and ${words[(i + 3) % words.length]}`,
    };
  });

  const candidates = detectTopicShifts(cues, 5);
  assert.ok(candidates.length > 0);
  assert.equal(candidates[0].signal, "topic_shift");
});

test("detectTopicShifts: no shift with consistent topic", () => {
  const cues = Array.from({ length: 25 }, (_, i) => ({
    start_ms: i * 2000,
    end_ms: (i + 1) * 2000,
    text: "machine learning neural network deep learning model training",
  }));
  const candidates = detectTopicShifts(cues, 5);
  assert.equal(candidates.length, 0);
});

test("detectTopicShifts: not enough cues returns empty", () => {
  const cues = [
    { start_ms: 0, end_ms: 2000, text: "hello" },
    { start_ms: 2000, end_ms: 4000, text: "world" },
  ];
  assert.equal(detectTopicShifts(cues, 5).length, 0);
});

// ─── detectSpeakerChanges ────────────────────────────────────────────────────

test("detectSpeakerChanges: detects speaker transitions", () => {
  const segments = [
    { speaker_key: "SPEAKER_0", start_ms: 0, end_ms: 10000 },
    { speaker_key: "SPEAKER_1", start_ms: 10000, end_ms: 20000 },
    { speaker_key: "SPEAKER_0", start_ms: 20000, end_ms: 30000 },
  ];
  const candidates = detectSpeakerChanges(segments);
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].signal, "speaker_change");
  assert.equal(candidates[0].timestamp_ms, 10000);
  assert.equal(candidates[1].timestamp_ms, 20000);
});

test("detectSpeakerChanges: same speaker throughout returns empty", () => {
  const segments = [
    { speaker_key: "SPEAKER_0", start_ms: 0, end_ms: 10000 },
    { speaker_key: "SPEAKER_0", start_ms: 10000, end_ms: 20000 },
  ];
  assert.equal(detectSpeakerChanges(segments).length, 0);
});

test("detectSpeakerChanges: empty/single segment returns empty", () => {
  assert.deepEqual(detectSpeakerChanges([]), []);
  assert.deepEqual(
    detectSpeakerChanges([{ speaker_key: "A", start_ms: 0, end_ms: 1000 }]),
    [],
  );
});

// ─── detectPhashJumps ────────────────────────────────────────────────────────

test("detectPhashJumps: detects large hash differences", () => {
  const hashes = [
    { hash: "aaaaaaaaaaaaaaaa", timestamp_ms: 0 },
    { hash: "aaaaaaaaaaaaaaaa", timestamp_ms: 5000 },
    { hash: "zzzzzzzzzzzzzzzz", timestamp_ms: 10000 }, // big jump
  ];
  const candidates = detectPhashJumps(hashes, 5);
  assert.ok(candidates.length > 0);
  assert.equal(candidates[0].signal, "phash_jump");
  assert.equal(candidates[0].timestamp_ms, 10000);
});

test("detectPhashJumps: similar hashes below threshold", () => {
  const hashes = [
    { hash: "aaaaaaaaaaaa", timestamp_ms: 0 },
    { hash: "aaaaaaaaaaab", timestamp_ms: 5000 }, // 1 char diff
  ];
  const candidates = detectPhashJumps(hashes, 12);
  assert.equal(candidates.length, 0);
});

test("detectPhashJumps: empty/single input returns empty", () => {
  assert.deepEqual(detectPhashJumps([]), []);
  assert.deepEqual(detectPhashJumps([{ hash: "abc", timestamp_ms: 0 }]), []);
});
