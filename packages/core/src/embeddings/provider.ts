import { embedWithOllama } from "./ollama";
import { embedWithOpenAI } from "./openai";
import { getYitDefault } from "../config/defaults";

export type EmbeddingsProvider = "ollama" | "openai" | "disabled";

export type EmbeddingsStatus = {
  enabled: boolean;
  provider: EmbeddingsProvider | null;
  model_id: string | null;
  dimensions: number | null;
  reason: string | null;
};

export type Embedder = {
  provider: Exclude<EmbeddingsProvider, "disabled">;
  model_id: string;
  dimensions: number;
  embed: (text: string) => Promise<number[]>;
};

function clean(s: unknown): string {
  return typeof s === "string" ? s.trim() : "";
}

export function getEmbeddingsStatus(env: Record<string, string | undefined> = process.env): EmbeddingsStatus {
  const providerRaw = clean(env.YIT_EMBED_PROVIDER).toLowerCase();
  const provider: EmbeddingsProvider =
    providerRaw === "openai" || providerRaw === "ollama" || providerRaw === "disabled"
      ? (providerRaw as EmbeddingsProvider)
      : "ollama";

  if (provider === "disabled") {
    return { enabled: false, provider: "disabled", model_id: null, dimensions: null, reason: "embeddings disabled" };
  }

  if (provider === "openai") {
    const apiKey = clean(env.OPENAI_API_KEY);
    if (!apiKey) {
      return {
        enabled: false,
        provider: "openai",
        model_id: null,
        dimensions: null,
        reason: "OPENAI_API_KEY not set",
      };
    }

    const model = clean(env.YIT_OPENAI_EMBED_MODEL) || "text-embedding-3-small";
    const dimsRaw = clean(env.YIT_OPENAI_EMBED_DIMENSIONS);
    const dims = dimsRaw ? Number(dimsRaw) : 768;
    if (!Number.isFinite(dims) || dims <= 0) {
      return { enabled: false, provider: "openai", model_id: null, dimensions: null, reason: "invalid YIT_OPENAI_EMBED_DIMENSIONS" };
    }

    // DB schema is vector(768) today; keep this loud.
    if (dims !== 768) {
      return {
        enabled: false,
        provider: "openai",
        model_id: null,
        dimensions: null,
        reason: `db expects 768-dim vectors; got dimensions=${dims}`,
      };
    }

    return {
      enabled: true,
      provider: "openai",
      model_id: `openai:${model}:${dims}`,
      dimensions: dims,
      reason: null,
    };
  }

  // provider === "ollama"
  const model = clean(env.OLLAMA_EMBED_MODEL) || "nomic-embed-text";
  return {
    enabled: true,
    provider: "ollama",
    model_id: model,
    dimensions: 768,
    reason: null,
  };
}

export function createEmbedderFromEnv(env: Record<string, string | undefined> = process.env): Embedder {
  const status = getEmbeddingsStatus(env);
  if (!status.enabled || !status.provider || !status.model_id || !status.dimensions) {
    throw new Error(status.reason || "embeddings disabled");
  }

  if (status.provider === "openai") {
    const apiKey = clean(env.OPENAI_API_KEY);
    const model = clean(env.YIT_OPENAI_EMBED_MODEL) || "text-embedding-3-small";
    const baseUrl = clean(env.OPENAI_BASE_URL) || getYitDefault("OPENAI_BASE_URL");
    const dims = status.dimensions;
    return {
      provider: "openai",
      model_id: status.model_id,
      dimensions: dims,
      embed: async (text: string) => {
        return embedWithOpenAI({ apiKey, model, input: text, dimensions: dims, baseUrl });
      },
    };
  }

  if (status.provider === "ollama") {
    const baseUrl = clean(env.OLLAMA_BASE_URL) || getYitDefault("OLLAMA_BASE_URL");
    const model = clean(env.OLLAMA_EMBED_MODEL) || "nomic-embed-text";
    return {
      provider: "ollama",
      model_id: status.model_id,
      dimensions: status.dimensions,
      embed: async (text: string) => {
        return embedWithOllama({ baseUrl, model, prompt: text });
      },
    };
  }

  throw new Error(status.reason || "embeddings disabled");
}
