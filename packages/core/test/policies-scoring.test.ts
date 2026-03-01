import test from "node:test";
import assert from "node:assert/strict";
import { computePriorityForHit } from "../src/policies/scoring";
import { PriorityConfigSchema } from "@yt/contracts";

const cfg = PriorityConfigSchema.parse({
  weights: { recency: 0.2, relevance: 0.7, channel_boost: 0.1 },
  thresholds: { high: 0.8, medium: 0.4 },
});

test("computePriorityForHit calculates weighted score and bucket", () => {
  const out = computePriorityForHit({
    baseScore: 0.5,
    maxBaseScore: 1,
    recencyNorm: 1,
    channelBoost: 0,
    config: cfg,
  });
  assert.equal(out.priorityScore, 0.55);
  assert.equal(out.priorityBucket, "medium");
});

test("computePriorityForHit clamps invalid inputs", () => {
  const out = computePriorityForHit({
    baseScore: -10,
    maxBaseScore: 0,
    recencyNorm: 9,
    channelBoost: -4,
    config: cfg,
  });
  assert.equal(out.reasons.normalized_relevance, 0);
  assert.equal(out.reasons.recency_norm, 1);
  assert.equal(out.reasons.channel_boost, 0);
});

test("threshold ordering is normalized when medium > high", () => {
  const swapped = PriorityConfigSchema.parse({
    weights: { recency: 0, relevance: 1, channel_boost: 0 },
    thresholds: { high: 0.2, medium: 0.9 },
  });
  const out = computePriorityForHit({
    baseScore: 0.5,
    maxBaseScore: 1,
    recencyNorm: 0,
    channelBoost: 0,
    config: swapped,
  });
  assert.equal(out.priorityBucket, "low");
});
