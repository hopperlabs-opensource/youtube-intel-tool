import { execSync } from "node:child_process";
import type { VisionConfig } from "@yt/contracts";
import type { VisionProviderAdapter, VisionRequest, VisionResponse } from "./types";
import { createClaudeVisionProvider } from "./providers/claude";
import { createOpenAIVisionProvider } from "./providers/openai";
import { createGeminiVisionProvider } from "./providers/gemini";
import { createOllamaVisionProvider } from "./providers/ollama";
import { createClaudeCliVisionProvider } from "./providers/claude-cli";
import { createGeminiCliVisionProvider } from "./providers/gemini-cli";
import { createCodexCliVisionProvider } from "./providers/codex-cli";

export function createVisionProvider(config: VisionConfig): VisionProviderAdapter {
  switch (config.provider) {
    case "claude":
      return createClaudeVisionProvider({
        apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY || "",
        model: config.model,
        baseUrl: config.baseUrl,
      });
    case "openai":
      return createOpenAIVisionProvider({
        apiKey: config.apiKey || process.env.OPENAI_API_KEY || "",
        model: config.model,
        baseUrl: config.baseUrl,
      });
    case "gemini":
      return createGeminiVisionProvider({
        apiKey: config.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "",
        model: config.model,
      });
    case "ollama":
      return createOllamaVisionProvider({
        model: config.model,
        baseUrl: config.baseUrl,
      });
    case "claude-cli":
      return createClaudeCliVisionProvider({ model: config.model });
    case "gemini-cli":
      return createGeminiCliVisionProvider({ model: config.model });
    case "codex-cli":
      return createCodexCliVisionProvider({ model: config.model });
    default:
      throw new Error(`Unknown vision provider: ${config.provider}`);
  }
}

/** Check which CLI-based providers are locally available */
function isCommandAvailable(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export interface DetectedProvider {
  provider: string;
  type: "api" | "cli" | "local";
  available: boolean;
  free: boolean;
}

/**
 * Detect all available vision providers on this system.
 * CLI-based providers are checked via `which`. API providers are always listed
 * but marked as available only if env vars are set.
 */
export function detectAvailableProviders(): DetectedProvider[] {
  return [
    // CLI-based (free with existing subscriptions)
    { provider: "claude-cli", type: "cli", available: isCommandAvailable("claude"), free: true },
    { provider: "gemini-cli", type: "cli", available: isCommandAvailable("gemini"), free: true },
    { provider: "codex-cli", type: "cli", available: isCommandAvailable("codex"), free: true },

    // Local (free)
    { provider: "ollama", type: "local", available: isCommandAvailable("ollama"), free: true },

    // API-based (paid)
    { provider: "claude", type: "api", available: !!process.env.ANTHROPIC_API_KEY, free: false },
    { provider: "openai", type: "api", available: !!process.env.OPENAI_API_KEY, free: false },
    { provider: "gemini", type: "api", available: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY), free: false },
  ];
}

/**
 * Auto-select the best available provider, preferring free/local options.
 * Priority: CLI providers > Ollama > API providers.
 */
export function autoSelectProvider(preferLocal: boolean = true): VisionConfig {
  const providers = detectAvailableProviders();

  if (preferLocal) {
    // Prefer free options
    const freeAvailable = providers.filter((p) => p.free && p.available);
    if (freeAvailable.length > 0) {
      return makeConfig(freeAvailable[0]);
    }
  }

  // Fall back to API providers
  const apiAvailable = providers.filter((p) => p.type === "api" && p.available);
  if (apiAvailable.length > 0) {
    return makeConfig(apiAvailable[0]);
  }

  throw new Error(
    "No vision providers available. Install a CLI (claude, gemini, codex), " +
    "run Ollama locally, or set an API key (ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY).",
  );
}

/**
 * Return an ordered list of provider configs to try, for use with createFallbackVisionProvider().
 * Priority when preferLocal: claude-cli → codex-cli → gemini-cli → ollama → API providers.
 */
export function autoSelectProviderChain(preferLocal: boolean = true): VisionConfig[] {
  const providers = detectAvailableProviders();
  const available = providers.filter((p) => p.available);

  let ordered: DetectedProvider[];
  if (preferLocal) {
    ordered = [
      ...available.filter((p) => p.provider === "claude-cli"),
      ...available.filter((p) => p.provider === "codex-cli"),
      ...available.filter((p) => p.provider === "gemini-cli"),
      ...available.filter((p) => p.provider === "ollama"),
      ...available.filter((p) => p.type === "api"),
    ];
  } else {
    // API-first ordering
    ordered = [
      ...available.filter((p) => p.type === "api"),
      ...available.filter((p) => p.free),
    ];
  }

  if (ordered.length === 0) {
    throw new Error(
      "No vision providers available. Install a CLI (claude, gemini, codex), " +
      "run Ollama locally, or set an API key (ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY).",
    );
  }

  return ordered.map((p) => makeConfig(p));
}

/**
 * Wrap multiple providers into a single adapter that tries each in order.
 * Falls through on errors and on refusal responses (e.g. "I cannot analyze images").
 */
export function createFallbackVisionProvider(
  providers: VisionProviderAdapter[],
): VisionProviderAdapter {
  if (providers.length === 0) throw new Error("No vision providers supplied");
  if (providers.length === 1) return providers[0];

  return {
    name: providers.map((p) => p.name).join("→"),
    model: providers[0].model,
    async analyze(req: VisionRequest): Promise<VisionResponse> {
      let lastError: Error | undefined;
      for (const provider of providers) {
        try {
          const result = await provider.analyze(req);
          // Validate the response has actual content (not a refusal)
          if (
            result.description &&
            result.description.length > 20 &&
            !result.description.toLowerCase().includes("cannot analyze") &&
            !result.description.toLowerCase().includes("do not have the capability") &&
            !result.description.toLowerCase().includes("unable to view") &&
            !result.description.toLowerCase().includes("can't see the image")
          ) {
            return result;
          }
          // Provider returned a refusal — treat as failure, try next
          lastError = new Error(
            `${provider.name} returned a refusal: ${result.description.slice(0, 100)}`,
          );
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
        }
      }
      throw lastError ?? new Error("All vision providers failed");
    },
  };
}

function makeConfig(p: DetectedProvider): VisionConfig {
  return {
    provider: p.provider as VisionConfig["provider"],
    model: getDefaultModel(p.provider),
    maxTokensPerFrame: 512,
    temperature: 0.2,
    contextCarryover: true,
    promptTemplate: "describe",
  };
}

function getDefaultModel(provider: string): string {
  switch (provider) {
    case "claude":
      return "claude-sonnet-4-20250514";
    case "claude-cli":
      return "sonnet";  // CLI resolves aliases; don't hardcode dated model IDs
    case "openai":
      return "gpt-4o";
    case "gemini":
    case "gemini-cli":
      return "gemini-2.0-flash";
    case "ollama":
      return "llava";
    case "codex-cli":
      return "o4-mini";
    default:
      return "default";
  }
}
