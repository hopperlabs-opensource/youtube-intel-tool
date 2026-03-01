import type { LlmConfig, ResolvedLlmConfig, TextProvider, LlmProviderDetection } from "@yt/contracts";
import { detectAvailableProviders, type DetectedProvider } from "../vision/provider-factory";
import {
  runClaudeCliText,
  runClaudeCliStructured,
  runGeminiCliText,
  runGeminiCliStructured,
  runCodexCliText,
  runCodexCliStructured,
  extractJsonFromText,
} from "./cli";

// ─── TextLlmAdapter ─────────────────────────────────────────────────────────

export interface TextLlmAdapter {
  readonly provider: string;
  readonly model: string;
  call(prompt: string): Promise<{ text: string; durationMs: number }>;
  callStructured<T = unknown>(
    prompt: string,
    opts: { schema?: unknown; input?: string; timeoutMs?: number },
  ): Promise<{ structured: T; durationMs: number }>;
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createTextLlm(config: ResolvedLlmConfig): TextLlmAdapter {
  return createTextLlmForProvider(config.textProvider, config.textModel, config);
}

function createTextLlmForProvider(
  provider: TextProvider,
  model: string,
  config: ResolvedLlmConfig,
): TextLlmAdapter {
  switch (provider) {
    case "claude-cli":
      return {
        provider: "claude-cli",
        model,
        async call(prompt) {
          const res = await runClaudeCliText({ prompt, model: model || undefined, timeoutMs: 180_000 });
          return { text: res.text, durationMs: res.durationMs };
        },
        async callStructured(prompt, opts) {
          const res = await runClaudeCliStructured({
            prompt: opts.input ? `${prompt}\n\nINPUT JSON:\n${opts.input}` : prompt,
            schema: opts.schema ?? {},
            model: model || undefined,
            timeoutMs: opts.timeoutMs ?? 180_000,
          });
          return { structured: res.structured as any, durationMs: res.durationMs };
        },
      };

    case "gemini-cli":
      return {
        provider: "gemini-cli",
        model,
        async call(prompt) {
          const res = await runGeminiCliText({ prompt, model: model || undefined, timeoutMs: 180_000 });
          return { text: res.text, durationMs: res.durationMs };
        },
        async callStructured(prompt, opts) {
          const res = await runGeminiCliStructured({
            prompt,
            input: opts.input ?? "",
            model: model || undefined,
            timeoutMs: opts.timeoutMs ?? 180_000,
          });
          return { structured: res.structured as any, durationMs: res.durationMs };
        },
      };

    case "codex-cli":
      return {
        provider: "codex-cli",
        model,
        async call(prompt) {
          const res = await runCodexCliText({ prompt, model: model || undefined, timeoutMs: 180_000 });
          return { text: res.text, durationMs: res.durationMs };
        },
        async callStructured(prompt, opts) {
          const res = await runCodexCliStructured({
            prompt: opts.input ? `${prompt}\n\nINPUT JSON:\n${opts.input}` : prompt,
            schema: opts.schema ?? {},
            model: model || undefined,
            timeoutMs: opts.timeoutMs ?? 180_000,
          });
          return { structured: res.structured as any, durationMs: res.durationMs };
        },
      };

    case "claude":
    case "openai":
    case "gemini":
      throw new Error(
        `API-based text provider "${provider}" is not yet supported for direct calls. ` +
          `Use a CLI provider (claude-cli, gemini-cli, codex-cli) or set preferLocal=true.`,
      );

    default:
      throw new Error(`Unknown text provider: ${provider}`);
  }
}

// ─── Config Resolution ───────────────────────────────────────────────────────

const DEFAULT_TEXT_MODELS: Record<string, string> = {
  "claude-cli": "claude-sonnet-4-20250514",
  "gemini-cli": "gemini-2.0-flash",
  "codex-cli": "o4-mini",
  "claude": "claude-sonnet-4-20250514",
  "openai": "gpt-4o",
  "gemini": "gemini-2.0-flash",
};

const DEFAULT_VISION_MODELS: Record<string, string> = {
  "claude-cli": "claude-sonnet-4-20250514",
  "gemini-cli": "gemini-2.0-flash",
  "codex-cli": "o4-mini",
  "claude": "claude-sonnet-4-20250514",
  "openai": "gpt-4o",
  "gemini": "gemini-2.0-flash",
  "ollama": "llava",
};

/**
 * Map legacy YIT_ENRICH_CLI_PROVIDER values to TextProvider values.
 * The legacy env var uses "gemini" to mean gemini-cli, etc.
 */
function mapLegacyProvider(legacy: string): TextProvider | null {
  const mapping: Record<string, TextProvider> = {
    gemini: "gemini-cli",
    claude: "claude-cli",
    codex: "codex-cli",
  };
  return mapping[legacy] ?? null;
}

export function resolveTextConfig(partial?: LlmConfig): ResolvedLlmConfig {
  // 1. Explicit params (highest priority)
  let textProvider = partial?.textProvider ?? null;
  let textModel = partial?.textModel ?? null;
  let visionProvider = partial?.visionProvider ?? null;
  let visionModel = partial?.visionModel ?? null;
  const temperature = partial?.temperature ?? 0.2;
  const maxTokensPerCall = partial?.maxTokensPerCall ?? 4096;
  const preferLocal = partial?.preferLocal ?? true;

  // 2. Env vars
  const envTextProvider = (process.env.YIT_TEXT_PROVIDER || "").trim() || null;
  const envTextModel = (process.env.YIT_TEXT_MODEL || "").trim() || null;
  const envVisionProvider = (process.env.YIT_VISION_PROVIDER || "").trim() || null;
  const envVisionModel = (process.env.YIT_VISION_MODEL || "").trim() || null;

  if (!textProvider && envTextProvider) {
    textProvider = envTextProvider as TextProvider;
  }
  if (!textModel && envTextModel) {
    textModel = envTextModel;
  }
  if (!visionProvider && envVisionProvider) {
    visionProvider = envVisionProvider as any;
  }
  if (!visionModel && envVisionModel) {
    visionModel = envVisionModel;
  }

  // 3. Legacy env vars
  if (!textProvider) {
    const legacyProvider = (process.env.YIT_ENRICH_CLI_PROVIDER || "").trim().toLowerCase();
    if (legacyProvider) {
      textProvider = mapLegacyProvider(legacyProvider) ?? (legacyProvider as TextProvider);
    }
  }
  if (!textModel) {
    const legacyModel = (process.env.YIT_ENRICH_CLI_MODEL || "").trim();
    if (legacyModel) textModel = legacyModel;
  }

  // 4. Auto-detect from available providers
  if (!textProvider || !visionProvider) {
    const detected = detectAvailableProviders();
    const available = detected.filter((p) => p.available);

    if (!textProvider) {
      const textCapable = preferLocal
        ? available.filter((p) => p.free)
        : available;
      if (textCapable.length > 0) {
        textProvider = textCapable[0].provider as TextProvider;
      } else if (available.length > 0) {
        textProvider = available[0].provider as TextProvider;
      }
    }

    if (!visionProvider) {
      const visionCapable = preferLocal
        ? available.filter((p) => p.free)
        : available;
      if (visionCapable.length > 0) {
        visionProvider = visionCapable[0].provider as any;
      } else if (available.length > 0) {
        visionProvider = available[0].provider as any;
      }
    }
  }

  if (!textProvider) {
    throw new Error(
      "No text LLM provider available. Install a CLI (claude, gemini, codex) " +
        "or set YIT_TEXT_PROVIDER environment variable.",
    );
  }

  const resolvedTextProvider: TextProvider = textProvider;
  const resolvedVisionProvider = visionProvider ?? (resolvedTextProvider as any);
  const resolvedTextModel = textModel || DEFAULT_TEXT_MODELS[resolvedTextProvider] || "default";
  const resolvedVisionModel = visionModel || DEFAULT_VISION_MODELS[resolvedVisionProvider] || "default";

  return {
    textProvider: resolvedTextProvider,
    textModel: resolvedTextModel,
    visionProvider: resolvedVisionProvider,
    visionModel: resolvedVisionModel,
    temperature,
    maxTokensPerCall,
    preferLocal,
    maxTotalTokens: partial?.maxTotalTokens ?? undefined,
    maxCostUsd: partial?.maxCostUsd ?? undefined,
  };
}

// ─── Provider Detection ──────────────────────────────────────────────────────

export function detectAllProviders(): LlmProviderDetection[] {
  const visionDetected = detectAvailableProviders();

  return visionDetected.map((p: DetectedProvider) => ({
    provider: p.provider,
    type: p.type,
    available: p.available,
    free: p.free,
    supportsText: isTextCapable(p.provider),
    supportsVision: true,
  }));
}

function isTextCapable(provider: string): boolean {
  // All providers that support text generation (CLI-based always do)
  return ["claude-cli", "gemini-cli", "codex-cli", "claude", "openai", "gemini"].includes(provider);
}
