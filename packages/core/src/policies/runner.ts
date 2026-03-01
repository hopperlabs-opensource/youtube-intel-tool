import type pg from "pg";
import {
  PriorityConfigSchema,
  type LibrarySearchHit,
  type PolicyHit,
  type PolicyRun,
  type PolicyRunStats,
  type PolicyRunTrigger,
  type SavedPolicy,
} from "@yt/contracts";
import { createEmbedderFromEnv } from "../embeddings/provider";
import { searchChunksSemanticGlobal, searchCuesKeywordGlobal } from "../repos/search";
import { createPolicyRun, getVideoRecencyMap, insertPolicyHit, updatePolicyRun } from "../repos/policies";
import { computePriorityForHit } from "./scoring";

type PolicySearchResult = {
  hits: LibrarySearchHit[];
  embedding_error: string | null;
};

function normalizeChannelName(value: string): string {
  return value.trim().toLowerCase();
}

async function executePolicySearch(
  client: pg.PoolClient,
  policy: SavedPolicy,
  env?: Record<string, string | undefined>
): Promise<PolicySearchResult> {
  const body = policy.search_payload;
  if (body.mode === "keyword") {
    const hits = await searchCuesKeywordGlobal(client, body.query, {
      limit: body.limit,
      language: body.language,
      scope: body.scope,
    });
    return { hits, embedding_error: null };
  }

  let embedding_error: string | null = null;
  let embedder: ReturnType<typeof createEmbedderFromEnv> | null = null;
  try {
    embedder = createEmbedderFromEnv(env ?? process.env);
  } catch (err: unknown) {
    embedding_error = err instanceof Error ? err.message : String(err);
  }

  const semanticSearch = async (): Promise<LibrarySearchHit[]> => {
    if (!embedder) return [];
    const emb = await embedder.embed(body.query);
    if (emb.length !== 768) throw new Error(`expected 768 dims, got ${emb.length}`);
    return searchChunksSemanticGlobal(client, emb, {
      limit: body.limit,
      language: body.language,
      model_id: embedder.model_id,
      scope: body.scope,
    });
  };

  if (body.mode === "semantic") {
    if (!embedder) return { hits: [], embedding_error };
    try {
      const hits = await semanticSearch();
      return { hits, embedding_error };
    } catch (err: unknown) {
      embedding_error = err instanceof Error ? err.message : String(err);
      return { hits: [], embedding_error };
    }
  }

  const keywordHits = await searchCuesKeywordGlobal(client, body.query, {
    limit: body.limit,
    language: body.language,
    scope: body.scope,
  });

  let semanticHits: LibrarySearchHit[] = [];
  if (embedder) {
    try {
      semanticHits = await semanticSearch();
    } catch (err: unknown) {
      embedding_error = err instanceof Error ? err.message : String(err);
      semanticHits = [];
    }
  }

  const byKey = new Map<string, LibrarySearchHit>();
  for (const hit of semanticHits) {
    byKey.set(`${hit.video_id}:${hit.cue_id}`, { ...hit, score: hit.score * 1.2 });
  }
  for (const hit of keywordHits) {
    const key = `${hit.video_id}:${hit.cue_id}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, hit);
      continue;
    }
    byKey.set(key, {
      ...existing,
      score: Math.max(existing.score, hit.score),
      snippet: existing.snippet || hit.snippet,
    });
  }

  const merged = Array.from(byKey.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, body.limit);
  return { hits: merged, embedding_error };
}

export async function runPolicyNow(
  client: pg.PoolClient,
  input: {
    policy: SavedPolicy;
    triggered_by: PolicyRunTrigger;
    embeddingsEnv?: Record<string, string | undefined>;
  }
): Promise<{ run: PolicyRun; hits: PolicyHit[] }> {
  const run = await createPolicyRun(client, {
    policy_id: input.policy.id,
    status: "running",
    triggered_by: input.triggered_by,
  });

  try {
    const search = await executePolicySearch(client, input.policy, input.embeddingsEnv);
    const config = PriorityConfigSchema.parse(input.policy.priority_config);
    const channelSet = new Set(
      (input.policy.search_payload.scope?.channel_names ?? []).map((v) => normalizeChannelName(v))
    );
    const maxBaseScore = search.hits.reduce((m, h) => Math.max(m, h.score), 0);
    const videoIds = Array.from(new Set(search.hits.map((h) => h.video_id)));
    const recencyMap = await getVideoRecencyMap(client, videoIds);
    const recencyValues = Array.from(recencyMap.values());
    const minRecency = recencyValues.length ? Math.min(...recencyValues) : 0;
    const maxRecency = recencyValues.length ? Math.max(...recencyValues) : 0;

    const inserted: PolicyHit[] = [];

    for (const hit of search.hits) {
      const baseScore = hit.score;

      const recencyRaw = recencyMap.get(hit.video_id);
      const recencyNorm =
        recencyRaw === undefined
          ? 0.5
          : maxRecency === minRecency
            ? 1
            : Math.max(0, Math.min(1, (recencyRaw - minRecency) / Math.max(1, maxRecency - minRecency)));

      const channelBoost =
        channelSet.size > 0 && hit.channel_name && channelSet.has(normalizeChannelName(hit.channel_name)) ? 1 : 0;

      const scored = computePriorityForHit({
        baseScore,
        maxBaseScore,
        recencyNorm,
        channelBoost,
        config,
      });
      const row = await insertPolicyHit(client, {
        run_id: run.id,
        policy_id: input.policy.id,
        video_id: hit.video_id,
        cue_id: hit.cue_id,
        start_ms: hit.start_ms,
        snippet: hit.snippet,
        base_score: baseScore,
        priority_score: scored.priorityScore,
        priority_bucket: scored.priorityBucket,
        reasons: scored.reasons,
      });
      inserted.push(row);
    }

    const stats: PolicyRunStats = {
      total_hits: inserted.length,
      high: inserted.filter((h) => h.priority_bucket === "high").length,
      medium: inserted.filter((h) => h.priority_bucket === "medium").length,
      low: inserted.filter((h) => h.priority_bucket === "low").length,
      embedding_error: search.embedding_error,
    };

    const completed = await updatePolicyRun(client, run.id, {
      status: "completed",
      error: null,
      stats,
    });
    return { run: completed, hits: inserted };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await updatePolicyRun(client, run.id, { status: "failed", error: message });
    throw err;
  }
}
