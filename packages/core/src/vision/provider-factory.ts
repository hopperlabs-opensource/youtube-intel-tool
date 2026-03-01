import { execSync } from "node:child_process";
import type { VisionConfig } from "@yt/contracts";
import type { VisionProviderAdapter } from "./types";
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

  const makeConfig = (p: DetectedProvider): VisionConfig => ({
    provider: p.provider as VisionConfig["provider"],
    model: getDefaultModel(p.provider),
    maxTokensPerFrame: 512,
    temperature: 0.2,
    contextCarryover: true,
    promptTemplate: "describe",
  });

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

function getDefaultModel(provider: string): string {
  switch (provider) {
    case "claude":
    case "claude-cli":
      return "claude-sonnet-4-20250514";
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
