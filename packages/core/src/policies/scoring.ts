import type { PriorityBucket, PriorityConfig, PolicyHitReason } from "@yt/contracts";

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function toPriorityBucket(score: number, thresholds: { high: number; medium: number }): PriorityBucket {
  const high = Math.max(thresholds.high, thresholds.medium);
  const medium = Math.min(thresholds.medium, high);
  if (score >= high) return "high";
  if (score >= medium) return "medium";
  return "low";
}

export function computePriorityForHit(input: {
  baseScore: number;
  maxBaseScore: number;
  recencyNorm: number;
  channelBoost: number;
  config: PriorityConfig;
}): {
  priorityScore: number;
  priorityBucket: PriorityBucket;
  reasons: PolicyHitReason;
} {
  const normalizedRelevance =
    input.maxBaseScore > 0 ? clamp01(input.baseScore / input.maxBaseScore) : 0;
  const recencyNorm = clamp01(input.recencyNorm);
  const channelBoost = clamp01(input.channelBoost);

  const priorityScore =
    normalizedRelevance * input.config.weights.relevance +
    recencyNorm * input.config.weights.recency +
    channelBoost * input.config.weights.channel_boost;

  return {
    priorityScore,
    priorityBucket: toPriorityBucket(priorityScore, input.config.thresholds),
    reasons: {
      base_score: input.baseScore,
      normalized_relevance: normalizedRelevance,
      recency_norm: recencyNorm,
      channel_boost: channelBoost,
      weights: input.config.weights,
    },
  };
}
