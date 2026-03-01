import test from "node:test";
import assert from "node:assert/strict";
import { buildDenseActionTranscript, type DenseCue } from "../src/frames/dense-transcript";
import type { FrameAnalysisRow, TranscriptCue } from "@yt/contracts";

function makeAnalysisRow(overrides: Partial<FrameAnalysisRow>): FrameAnalysisRow {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    video_id: "00000000-0000-0000-0000-000000000001",
    frame_id: "00000000-0000-0000-0000-000000000002",
    start_ms: 0,
    end_ms: 1000,
    description: "test frame description",
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

function makeCue(overrides: Partial<TranscriptCue>): TranscriptCue {
  return {
    id: "00000000-0000-0000-0000-000000000010",
    transcript_id: "00000000-0000-0000-0000-000000000011",
    idx: 0,
    start_ms: 0,
    end_ms: 2000,
    text: "test cue text",
    ...overrides,
  };
}

// Mock LLM that returns valid interpolation JSON
function createMockLlm(responseOverride?: string) {
  return async (prompt: string): Promise<string> => {
    if (responseOverride) return responseOverride;
    // Parse gap count from prompt and generate responses
    const gapMatches = prompt.match(/GAP (\d+)/g);
    const gapCount = gapMatches ? gapMatches.length : 0;
    const gaps = Array.from({ length: gapCount }, (_, i) => ({
      gap_index: i,
      cues: [
        { offset_s: 0, description: "Interpolated action description", scene_type: "talking_head" },
        { offset_s: 1, description: "Continued action", scene_type: "talking_head" },
      ],
    }));
    return JSON.stringify({ gaps });
  };
}

// ─── buildDenseActionTranscript ──────────────────────────────────────────────

test("empty analyses returns empty", async () => {
  const result = await buildDenseActionTranscript({
    analyses: [],
    llmCall: createMockLlm(),
  });
  assert.deepEqual(result, []);
});

test("creates direct cues from frame analyses", async () => {
  const analyses = [
    makeAnalysisRow({ start_ms: 0, end_ms: 1000, description: "Person speaking", scene_type: "talking_head", frame_id: "frame-1" }),
    makeAnalysisRow({ start_ms: 1000, end_ms: 2000, description: "Slide shown", scene_type: "presentation", frame_id: "frame-2" }),
  ];

  const result = await buildDenseActionTranscript({
    analyses,
    llmCall: createMockLlm(),
    gapThresholdMs: 5000, // No gaps > 5s, so no interpolation needed
  });

  assert.equal(result.length, 2);
  assert.equal(result[0].interpolated, false);
  assert.equal(result[0].confidence, 1.0);
  assert.equal(result[0].description, "Person speaking");
  assert.equal(result[0].source_frame_id, "frame-1");
  assert.equal(result[1].description, "Slide shown");
});

test("detects gaps between sparse analyses and interpolates", async () => {
  const analyses = [
    makeAnalysisRow({ start_ms: 0, end_ms: 1000, description: "Opening shot", scene_type: "outdoor" }),
    makeAnalysisRow({ start_ms: 10000, end_ms: 11000, description: "Interview", scene_type: "talking_head" }),
  ];
  // 9s gap between 1000 and 10000 — should trigger interpolation

  const result = await buildDenseActionTranscript({
    analyses,
    llmCall: createMockLlm(),
    gapThresholdMs: 3000,
  });

  // Should have direct cues + interpolated cues
  const direct = result.filter((c) => !c.interpolated);
  const interpolated = result.filter((c) => c.interpolated);

  assert.equal(direct.length, 2);
  assert.ok(interpolated.length > 0);
  assert.ok(interpolated.every((c) => c.confidence !== null && c.confidence < 1.0));
});

test("interpolated cues are sorted by start_ms", async () => {
  const analyses = [
    makeAnalysisRow({ start_ms: 0, end_ms: 1000, description: "Start" }),
    makeAnalysisRow({ start_ms: 20000, end_ms: 21000, description: "End" }),
  ];

  const result = await buildDenseActionTranscript({
    analyses,
    llmCall: createMockLlm(),
    gapThresholdMs: 3000,
  });

  // Verify sorted order
  for (let i = 1; i < result.length; i++) {
    assert.ok(result[i].start_ms >= result[i - 1].start_ms, "Cues should be sorted by start_ms");
  }
});

test("LLM failure falls back to placeholder cues", async () => {
  const analyses = [
    makeAnalysisRow({ start_ms: 0, end_ms: 1000, description: "Start", scene_type: "screencast" }),
    makeAnalysisRow({ start_ms: 10000, end_ms: 11000, description: "End", scene_type: "screencast" }),
  ];

  const failingLlm = async (): Promise<string> => {
    throw new Error("LLM unavailable");
  };

  const result = await buildDenseActionTranscript({
    analyses,
    llmCall: failingLlm,
    gapThresholdMs: 3000,
  });

  const interpolated = result.filter((c) => c.interpolated);
  assert.ok(interpolated.length > 0);
  // Placeholder cues have confidence 0.3
  assert.ok(interpolated.every((c) => c.confidence === 0.3));
  // Placeholder descriptions mention the scene type
  assert.ok(interpolated.every((c) => c.description.includes("screencast")));
});

test("no gaps below threshold means no interpolation", async () => {
  const analyses = [
    makeAnalysisRow({ start_ms: 0, end_ms: 1000, description: "Frame 1" }),
    makeAnalysisRow({ start_ms: 1000, end_ms: 2000, description: "Frame 2" }),
    makeAnalysisRow({ start_ms: 2000, end_ms: 3000, description: "Frame 3" }),
  ];

  let llmCalled = false;
  const result = await buildDenseActionTranscript({
    analyses,
    llmCall: async () => { llmCalled = true; return "{}"; },
    gapThresholdMs: 3000,
  });

  assert.equal(llmCalled, false);
  assert.equal(result.length, 3);
  assert.ok(result.every((c) => !c.interpolated));
});

test("transcript cues are passed through for context", async () => {
  const analyses = [
    makeAnalysisRow({ start_ms: 0, end_ms: 1000, description: "Scene 1" }),
    makeAnalysisRow({ start_ms: 10000, end_ms: 11000, description: "Scene 2" }),
  ];
  const cues = [
    makeCue({ start_ms: 3000, end_ms: 5000, text: "And then we talked about it" }),
    makeCue({ start_ms: 5000, end_ms: 7000, text: "Moving on to the next topic" }),
  ];

  let capturedPrompt = "";
  const result = await buildDenseActionTranscript({
    analyses,
    transcriptCues: cues,
    llmCall: async (prompt) => {
      capturedPrompt = prompt;
      return JSON.stringify({ gaps: [{ gap_index: 0, cues: [{ offset_s: 0, description: "Test", scene_type: "talking_head" }] }] });
    },
    gapThresholdMs: 3000,
  });

  // The LLM prompt should include transcript context
  assert.ok(capturedPrompt.includes("talked about"));
});
