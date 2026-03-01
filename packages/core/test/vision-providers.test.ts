import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { VisionProviderAdapter, VisionRequest, VisionResponse } from "../src/vision/types";
import { createFallbackVisionProvider } from "../src/vision/provider-factory";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(overrides?: Partial<VisionRequest>): VisionRequest {
  return {
    imageBase64: "iVBORw0KGgo=", // tiny PNG stub
    mimeType: "image/png",
    prompt: "Describe this image in detail.",
    maxTokens: 512,
    temperature: 0.2,
    ...overrides,
  };
}

function makeResponse(overrides?: Partial<VisionResponse>): VisionResponse {
  return {
    description: "A person standing in front of a whiteboard explaining a diagram.",
    objects: [],
    textOverlay: null,
    sceneType: null,
    promptTokens: null,
    completionTokens: null,
    ...overrides,
  };
}

function makeMockProvider(
  name: string,
  result: VisionResponse | Error,
): VisionProviderAdapter {
  return {
    name,
    model: "test-model",
    async analyze(_req: VisionRequest): Promise<VisionResponse> {
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

// ── Fallback provider tests ──────────────────────────────────────────────────

describe("createFallbackVisionProvider", () => {
  it("throws when given zero providers", () => {
    assert.throws(() => createFallbackVisionProvider([]), /No vision providers supplied/);
  });

  it("returns the single provider unchanged when given one", () => {
    const single = makeMockProvider("only", makeResponse());
    const fallback = createFallbackVisionProvider([single]);
    assert.strictEqual(fallback, single);
  });

  it("returns the first provider's result when it succeeds", async () => {
    const first = makeMockProvider("first", makeResponse({ description: "First provider result with enough detail." }));
    const second = makeMockProvider("second", makeResponse({ description: "Second provider result with enough detail." }));
    const fallback = createFallbackVisionProvider([first, second]);

    const result = await fallback.analyze(makeRequest());
    assert.strictEqual(result.description, "First provider result with enough detail.");
  });

  it("falls through to next provider on error", async () => {
    const first = makeMockProvider("first", new Error("API timeout"));
    const second = makeMockProvider("second", makeResponse({ description: "Second provider result with enough detail." }));
    const fallback = createFallbackVisionProvider([first, second]);

    const result = await fallback.analyze(makeRequest());
    assert.strictEqual(result.description, "Second provider result with enough detail.");
  });

  it("falls through on refusal response ('cannot analyze')", async () => {
    const first = makeMockProvider(
      "first",
      makeResponse({ description: "I cannot analyze images without vision capabilities." }),
    );
    const second = makeMockProvider("second", makeResponse({ description: "A detailed scene description of a whiteboard." }));
    const fallback = createFallbackVisionProvider([first, second]);

    const result = await fallback.analyze(makeRequest());
    assert.strictEqual(result.description, "A detailed scene description of a whiteboard.");
  });

  it("falls through on refusal response ('do not have the capability')", async () => {
    const first = makeMockProvider(
      "first",
      makeResponse({ description: "I do not have the capability to see images." }),
    );
    const second = makeMockProvider("second", makeResponse({ description: "A detailed scene description of a whiteboard." }));
    const fallback = createFallbackVisionProvider([first, second]);

    const result = await fallback.analyze(makeRequest());
    assert.strictEqual(result.description, "A detailed scene description of a whiteboard.");
  });

  it("falls through on refusal response ('unable to view')", async () => {
    const first = makeMockProvider(
      "first",
      makeResponse({ description: "I am unable to view this image file." }),
    );
    const second = makeMockProvider("second", makeResponse({ description: "The image shows a coding tutorial on screen." }));
    const fallback = createFallbackVisionProvider([first, second]);

    const result = await fallback.analyze(makeRequest());
    assert.strictEqual(result.description, "The image shows a coding tutorial on screen.");
  });

  it("falls through on too-short description", async () => {
    const first = makeMockProvider("first", makeResponse({ description: "No content." }));
    const second = makeMockProvider("second", makeResponse({ description: "A very detailed description of the frame contents." }));
    const fallback = createFallbackVisionProvider([first, second]);

    const result = await fallback.analyze(makeRequest());
    assert.strictEqual(result.description, "A very detailed description of the frame contents.");
  });

  it("throws the last error when all providers fail", async () => {
    const first = makeMockProvider("first", new Error("First failed"));
    const second = makeMockProvider("second", new Error("Second failed"));
    const fallback = createFallbackVisionProvider([first, second]);

    await assert.rejects(() => fallback.analyze(makeRequest()), /Second failed/);
  });

  it("builds a composite name with arrow separator", () => {
    const first = makeMockProvider("claude-cli", makeResponse());
    const second = makeMockProvider("codex-cli", makeResponse());
    const third = makeMockProvider("gemini-cli", makeResponse());
    const fallback = createFallbackVisionProvider([first, second, third]);

    assert.strictEqual(fallback.name, "claude-cli→codex-cli→gemini-cli");
  });

  it("uses the first provider's model", () => {
    const first = { ...makeMockProvider("first", makeResponse()), model: "sonnet" };
    const second = { ...makeMockProvider("second", makeResponse()), model: "o4-mini" };
    const fallback = createFallbackVisionProvider([first, second]);

    assert.strictEqual(fallback.model, "sonnet");
  });
});

// ── Claude CLI provider arg tests ────────────────────────────────────────────

describe("claude-cli provider", () => {
  it("module exports createClaudeCliVisionProvider", async () => {
    const mod = await import("../src/vision/providers/claude-cli");
    assert.strictEqual(typeof mod.createClaudeCliVisionProvider, "function");
  });

  it("creates a provider with correct name and model", async () => {
    const { createClaudeCliVisionProvider } = await import("../src/vision/providers/claude-cli");
    const provider = createClaudeCliVisionProvider({ model: "sonnet" });
    assert.strictEqual(provider.name, "claude-cli");
    assert.strictEqual(provider.model, "sonnet");
  });

  it("defaults model to 'sonnet'", async () => {
    const { createClaudeCliVisionProvider } = await import("../src/vision/providers/claude-cli");
    const provider = createClaudeCliVisionProvider();
    assert.strictEqual(provider.model, "sonnet");
  });
});

// ── Codex CLI provider arg tests ─────────────────────────────────────────────

describe("codex-cli provider", () => {
  it("module exports createCodexCliVisionProvider", async () => {
    const mod = await import("../src/vision/providers/codex-cli");
    assert.strictEqual(typeof mod.createCodexCliVisionProvider, "function");
  });

  it("creates a provider with correct name and model", async () => {
    const { createCodexCliVisionProvider } = await import("../src/vision/providers/codex-cli");
    const provider = createCodexCliVisionProvider({ model: "o4-mini" });
    assert.strictEqual(provider.name, "codex-cli");
    assert.strictEqual(provider.model, "o4-mini");
  });
});

// ── Gemini CLI provider arg tests ────────────────────────────────────────────

describe("gemini-cli provider", () => {
  it("module exports createGeminiCliVisionProvider", async () => {
    const mod = await import("../src/vision/providers/gemini-cli");
    assert.strictEqual(typeof mod.createGeminiCliVisionProvider, "function");
  });

  it("creates a provider with correct name and model", async () => {
    const { createGeminiCliVisionProvider } = await import("../src/vision/providers/gemini-cli");
    const provider = createGeminiCliVisionProvider({ model: "gemini-2.0-flash" });
    assert.strictEqual(provider.name, "gemini-cli");
    assert.strictEqual(provider.model, "gemini-2.0-flash");
  });
});
