/**
 * Cost estimation and token budget management for vision API calls.
 * Prevents surprise bills by providing pre-flight cost estimates
 * and enforcing configurable budget caps.
 *
 * Pricing data is approximate and based on publicly available rates.
 * Users should verify against their actual provider pricing.
 */

export interface ProviderPricing {
  /** Cost per 1M input/prompt tokens in USD */
  inputPer1M: number;
  /** Cost per 1M output/completion tokens in USD */
  outputPer1M: number;
  /** Estimated input tokens per image (base64 at ~1280px) */
  estimatedImageInputTokens: number;
  /** Estimated input tokens for text prompt (~200 words) */
  estimatedPromptInputTokens: number;
}

/** Approximate pricing per provider/model (USD). Updated as of 2025. */
const PRICING: Record<string, ProviderPricing> = {
  // Claude
  "claude:claude-sonnet-4-20250514": {
    inputPer1M: 3.0,
    outputPer1M: 15.0,
    estimatedImageInputTokens: 1600,
    estimatedPromptInputTokens: 300,
  },
  "claude:claude-haiku-4-5-20251001": {
    inputPer1M: 0.80,
    outputPer1M: 4.0,
    estimatedImageInputTokens: 1600,
    estimatedPromptInputTokens: 300,
  },

  // OpenAI
  "openai:gpt-4o": {
    inputPer1M: 2.5,
    outputPer1M: 10.0,
    estimatedImageInputTokens: 765, // high detail tile-based
    estimatedPromptInputTokens: 300,
  },
  "openai:gpt-4o-mini": {
    inputPer1M: 0.15,
    outputPer1M: 0.60,
    estimatedImageInputTokens: 765,
    estimatedPromptInputTokens: 300,
  },

  // Gemini
  "gemini:gemini-2.0-flash": {
    inputPer1M: 0.10,
    outputPer1M: 0.40,
    estimatedImageInputTokens: 258,
    estimatedPromptInputTokens: 300,
  },
  "gemini:gemini-1.5-pro": {
    inputPer1M: 1.25,
    outputPer1M: 5.0,
    estimatedImageInputTokens: 258,
    estimatedPromptInputTokens: 300,
  },

  // Ollama (local, free)
  "ollama:llava": {
    inputPer1M: 0,
    outputPer1M: 0,
    estimatedImageInputTokens: 576,
    estimatedPromptInputTokens: 300,
  },
};

/** Default fallback pricing for unknown models */
const DEFAULT_PRICING: ProviderPricing = {
  inputPer1M: 3.0,
  outputPer1M: 15.0,
  estimatedImageInputTokens: 1600,
  estimatedPromptInputTokens: 300,
};

function getPricing(provider: string, model: string): ProviderPricing {
  return PRICING[`${provider}:${model}`] ?? PRICING[`${provider}:*`] ?? DEFAULT_PRICING;
}

export interface CostEstimate {
  /** Provider name */
  provider: string;
  /** Model name */
  model: string;
  /** Number of frames to analyze */
  frameCount: number;
  /** Estimated total input tokens */
  estimatedInputTokens: number;
  /** Estimated total output tokens */
  estimatedOutputTokens: number;
  /** Estimated total tokens (input + output) */
  estimatedTotalTokens: number;
  /** Estimated cost in USD */
  estimatedCostUsd: number;
  /** Whether the provider is local/free */
  isLocal: boolean;
}

/**
 * Estimate the cost of analyzing a set of frames with a vision provider.
 * This is a pre-flight estimate — actual costs may vary.
 */
export function estimateVisionCost(opts: {
  provider: string;
  model: string;
  frameCount: number;
  /** Expected max output tokens per frame (default 512) */
  maxOutputTokensPerFrame?: number;
}): CostEstimate {
  const { provider, model, frameCount } = opts;
  const maxOutput = opts.maxOutputTokensPerFrame ?? 512;
  const pricing = getPricing(provider, model);
  const isLocal = pricing.inputPer1M === 0 && pricing.outputPer1M === 0;

  const inputPerFrame = pricing.estimatedImageInputTokens + pricing.estimatedPromptInputTokens;
  const estimatedInputTokens = inputPerFrame * frameCount;
  // Assume ~80% of max output tokens are used on average
  const estimatedOutputTokens = Math.round(maxOutput * 0.8 * frameCount);
  const estimatedTotalTokens = estimatedInputTokens + estimatedOutputTokens;

  const inputCost = (estimatedInputTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (estimatedOutputTokens / 1_000_000) * pricing.outputPer1M;
  const estimatedCostUsd = Math.round((inputCost + outputCost) * 10000) / 10000;

  return {
    provider,
    model,
    frameCount,
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedTotalTokens,
    estimatedCostUsd,
    isLocal,
  };
}

/**
 * Format a cost estimate as a human-readable string.
 */
export function formatCostEstimate(est: CostEstimate): string {
  if (est.isLocal) {
    return `${est.frameCount} frames via ${est.provider}/${est.model} (local, no API cost)`;
  }

  return [
    `${est.frameCount} frames via ${est.provider}/${est.model}`,
    `  Estimated tokens: ~${est.estimatedTotalTokens.toLocaleString()} (${est.estimatedInputTokens.toLocaleString()} in + ${est.estimatedOutputTokens.toLocaleString()} out)`,
    `  Estimated cost:   ~$${est.estimatedCostUsd.toFixed(4)} USD`,
  ].join("\n");
}

export interface TokenBudget {
  /** Maximum total tokens (input + output) allowed */
  maxTotalTokens?: number;
  /** Maximum cost in USD allowed */
  maxCostUsd?: number;
}

/**
 * Check if a cost estimate exceeds a token budget.
 * Returns null if within budget, or a descriptive error string if exceeded.
 */
export function checkBudget(estimate: CostEstimate, budget: TokenBudget): string | null {
  if (budget.maxTotalTokens && estimate.estimatedTotalTokens > budget.maxTotalTokens) {
    return `Estimated tokens (${estimate.estimatedTotalTokens.toLocaleString()}) exceed budget of ${budget.maxTotalTokens.toLocaleString()} tokens. Reduce --max-frames or use a cheaper model.`;
  }

  if (budget.maxCostUsd && estimate.estimatedCostUsd > budget.maxCostUsd) {
    return `Estimated cost ($${estimate.estimatedCostUsd.toFixed(4)}) exceeds budget of $${budget.maxCostUsd.toFixed(4)} USD. Reduce --max-frames or use a cheaper model.`;
  }

  return null;
}

/**
 * Compute actual cost from token usage after a run.
 */
export function computeActualCost(opts: {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}): number {
  const pricing = getPricing(opts.provider, opts.model);
  const inputCost = (opts.inputTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (opts.outputTokens / 1_000_000) * pricing.outputPer1M;
  return Math.round((inputCost + outputCost) * 10000) / 10000;
}
