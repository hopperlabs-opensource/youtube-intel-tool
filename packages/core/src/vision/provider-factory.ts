import type { VisionConfig } from "@yt/contracts";
import type { VisionProviderAdapter } from "./types";
import { createClaudeVisionProvider } from "./providers/claude";
import { createOpenAIVisionProvider } from "./providers/openai";
import { createGeminiVisionProvider } from "./providers/gemini";
import { createOllamaVisionProvider } from "./providers/ollama";

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
    default:
      throw new Error(`Unknown vision provider: ${config.provider}`);
  }
}
