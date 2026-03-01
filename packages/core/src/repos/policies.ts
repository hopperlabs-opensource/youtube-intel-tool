import crypto from "node:crypto";
import type pg from "pg";
import {
  PolicyFeedItemSchema,
  PolicyHitSchema,
  PolicyRunSchema,
  SavedPolicySchema,
  type PolicyFeedItem,
  type PolicyHit,
  type PolicyRun,
  type PolicyRunStats,
  type PolicyRunStatus,
  type PolicyRunTrigger,
  type PriorityBucket,
  type PriorityConfig,
  type PolicySearchPayload,
  type SavedPolicy,
} from "@yt/contracts";

export function generateFeedToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

export async function createSavedPolicy(
  client: pg.PoolClient,
  input: {
    name: string;
    description?: string | null;
    enabled: boolean;
    search_payload: PolicySearchPayload;
    priority_config: PriorityConfig;
    feed_token?: string;
  }
): Promise<SavedPolicy> {
  const feedToken = input.feed_token ?? generateFeedToken();
  const res = await client.query(
    `
    INSERT INTO saved_policies (name, description, enabled, search_payload, priority_config, feed_token)
    VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
    RETURNING
      id::text as id,
      name,
      description,
      enabled,
      search_payload,
      priority_config,
      feed_token,
      created_at::text as created_at,
      updated_at::text as updated_at
    `,
    [
      input.name.trim(),
      input.description ?? null,
      input.enabled,
      JSON.stringify(input.search_payload),
      JSON.stringify(input.priority_config),
      feedToken,
    ]
  );
  return SavedPolicySchema.parse(res.rows[0]);
}

export async function listSavedPolicies(
  client: pg.PoolClient,
  opts?: { limit?: number; offset?: number }
): Promise<SavedPolicy[]> {
  const limit = Math.min(opts?.limit ?? 100, 500);
  const offset = Math.max(0, opts?.offset ?? 0);
  const res = await client.query(
    `
    SELECT
      id::text as id,
      name,
      description,
      enabled,
      search_payload,
      priority_config,
      feed_token,
      created_at::text as created_at,
      updated_at::text as updated_at
    FROM saved_policies
    ORDER BY updated_at DESC, created_at DESC
    LIMIT $1
    OFFSET $2
    `,
    [limit, offset]
  );
  return res.rows.map((r) => SavedPolicySchema.parse(r));
}

export async function getSavedPolicyById(client: pg.PoolClient, policyId: string): Promise<SavedPolicy | null> {
  const res = await client.query(
    `
    SELECT
      id::text as id,
      name,
      description,
      enabled,
      search_payload,
      priority_config,
      feed_token,
      created_at::text as created_at,
      updated_at::text as updated_at
    FROM saved_policies
    WHERE id = $1
    `,
    [policyId]
  );
  if (!res.rowCount) return null;
  return SavedPolicySchema.parse(res.rows[0]);
}

export async function getSavedPolicyByIdAndToken(
  client: pg.PoolClient,
  policyId: string,
  token: string
): Promise<SavedPolicy | null> {
  const res = await client.query(
    `
    SELECT
      id::text as id,
      name,
      description,
      enabled,
      search_payload,
      priority_config,
      feed_token,
      created_at::text as created_at,
      updated_at::text as updated_at
    FROM saved_policies
    WHERE id = $1
      AND feed_token = $2
    `,
    [policyId, token]
  );
  if (!res.rowCount) return null;
  return SavedPolicySchema.parse(res.rows[0]);
}

export async function updateSavedPolicy(
  client: pg.PoolClient,
  policyId: string,
  patch: Partial<{
    name: string;
    description: string | null;
    enabled: boolean;
    search_payload: PolicySearchPayload;
    priority_config: PriorityConfig;
    rotate_feed_token: boolean;
  }>
): Promise<SavedPolicy | null> {
  const hasName = patch.name !== undefined;
  const hasDescription = Object.prototype.hasOwnProperty.call(patch, "description");
  const hasEnabled = patch.enabled !== undefined;
  const hasSearchPayload = patch.search_payload !== undefined;
  const hasPriority = patch.priority_config !== undefined;
  const rotateFeedToken = patch.rotate_feed_token === true;
  const newToken = rotateFeedToken ? generateFeedToken() : null;

  const res = await client.query(
    `
    UPDATE saved_policies
    SET
      name = CASE WHEN $2::boolean THEN $3 ELSE name END,
      description = CASE WHEN $4::boolean THEN $5 ELSE description END,
      enabled = CASE WHEN $6::boolean THEN $7 ELSE enabled END,
      search_payload = CASE WHEN $8::boolean THEN $9::jsonb ELSE search_payload END,
      priority_config = CASE WHEN $10::boolean THEN $11::jsonb ELSE priority_config END,
      feed_token = CASE WHEN $12::boolean THEN $13 ELSE feed_token END,
      updated_at = now()
    WHERE id = $1
    RETURNING
      id::text as id,
      name,
      description,
      enabled,
      search_payload,
      priority_config,
      feed_token,
      created_at::text as created_at,
      updated_at::text as updated_at
    `,
    [
      policyId,
      hasName,
      hasName ? String(patch.name).trim() : null,
      hasDescription,
      hasDescription ? patch.description ?? null : null,
      hasEnabled,
      hasEnabled ? patch.enabled : null,
      hasSearchPayload,
      hasSearchPayload ? JSON.stringify(patch.search_payload) : null,
      hasPriority,
      hasPriority ? JSON.stringify(patch.priority_config) : null,
      rotateFeedToken,
      newToken,
    ]
  );
  if (!res.rowCount) return null;
  return SavedPolicySchema.parse(res.rows[0]);
}

export async function createPolicyRun(
  client: pg.PoolClient,
  input: {
    policy_id: string;
    status: PolicyRunStatus;
    triggered_by: PolicyRunTrigger;
  }
): Promise<PolicyRun> {
  const res = await client.query(
    `
    INSERT INTO policy_runs (policy_id, status, triggered_by, started_at)
    VALUES ($1, $2, $3, CASE WHEN $2 = 'running' THEN now() ELSE NULL END)
    RETURNING
      id::text as id,
      policy_id::text as policy_id,
      status,
      triggered_by,
      error,
      stats_json as stats,
      created_at::text as created_at,
      started_at::text as started_at,
      finished_at::text as finished_at
    `,
    [input.policy_id, input.status, input.triggered_by]
  );
  return PolicyRunSchema.parse(res.rows[0]);
}

export async function updatePolicyRun(
  client: pg.PoolClient,
  runId: string,
  patch: Partial<{
    status: PolicyRunStatus;
    error: string | null;
    stats: PolicyRunStats | null;
  }>
): Promise<PolicyRun> {
  const res = await client.query(
    `
    UPDATE policy_runs
    SET
      status = COALESCE($2, status),
      error = CASE WHEN $3::boolean THEN $4 ELSE error END,
      stats_json = CASE WHEN $5::boolean THEN $6::jsonb ELSE stats_json END,
      started_at = CASE WHEN $2 = 'running' AND started_at IS NULL THEN now() ELSE started_at END,
      finished_at = CASE WHEN $2 IN ('completed','failed') THEN now() ELSE finished_at END
    WHERE id = $1
    RETURNING
      id::text as id,
      policy_id::text as policy_id,
      status,
      triggered_by,
      error,
      stats_json as stats,
      created_at::text as created_at,
      started_at::text as started_at,
      finished_at::text as finished_at
    `,
    [
      runId,
      patch.status ?? null,
      Object.prototype.hasOwnProperty.call(patch, "error"),
      patch.error ?? null,
      Object.prototype.hasOwnProperty.call(patch, "stats"),
      patch.stats ? JSON.stringify(patch.stats) : null,
    ]
  );
  return PolicyRunSchema.parse(res.rows[0]);
}

export async function listPolicyRuns(
  client: pg.PoolClient,
  policyId: string,
  opts?: { limit?: number; offset?: number }
): Promise<PolicyRun[]> {
  const limit = Math.min(opts?.limit ?? 50, 200);
  const offset = Math.max(0, opts?.offset ?? 0);
  const res = await client.query(
    `
    SELECT
      id::text as id,
      policy_id::text as policy_id,
      status,
      triggered_by,
      error,
      stats_json as stats,
      created_at::text as created_at,
      started_at::text as started_at,
      finished_at::text as finished_at
    FROM policy_runs
    WHERE policy_id = $1
    ORDER BY created_at DESC
    LIMIT $2
    OFFSET $3
    `,
    [policyId, limit, offset]
  );
  return res.rows.map((r) => PolicyRunSchema.parse(r));
}

export async function getLatestCompletedPolicyRun(
  client: pg.PoolClient,
  policyId: string
): Promise<PolicyRun | null> {
  const res = await client.query(
    `
    SELECT
      id::text as id,
      policy_id::text as policy_id,
      status,
      triggered_by,
      error,
      stats_json as stats,
      created_at::text as created_at,
      started_at::text as started_at,
      finished_at::text as finished_at
    FROM policy_runs
    WHERE policy_id = $1
      AND status = 'completed'
    ORDER BY finished_at DESC NULLS LAST, created_at DESC
    LIMIT 1
    `,
    [policyId]
  );
  if (!res.rowCount) return null;
  return PolicyRunSchema.parse(res.rows[0]);
}

export async function insertPolicyHit(
  client: pg.PoolClient,
  input: {
    run_id: string;
    policy_id: string;
    video_id: string;
    cue_id: string;
    start_ms: number;
    snippet: string;
    base_score: number;
    priority_score: number;
    priority_bucket: PriorityBucket;
    reasons: PolicyHit["reasons"];
  }
): Promise<PolicyHit> {
  const res = await client.query(
    `
    INSERT INTO policy_hits
      (run_id, policy_id, video_id, cue_id, start_ms, snippet, base_score, priority_score, priority_bucket, reasons_json)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
    ON CONFLICT (run_id, video_id, cue_id)
    DO UPDATE SET
      start_ms = EXCLUDED.start_ms,
      snippet = EXCLUDED.snippet,
      base_score = EXCLUDED.base_score,
      priority_score = EXCLUDED.priority_score,
      priority_bucket = EXCLUDED.priority_bucket,
      reasons_json = EXCLUDED.reasons_json
    RETURNING
      id::text as id,
      run_id::text as run_id,
      policy_id::text as policy_id,
      video_id::text as video_id,
      cue_id::text as cue_id,
      start_ms,
      snippet,
      base_score,
      priority_score,
      priority_bucket,
      reasons_json as reasons,
      created_at::text as created_at
    `,
    [
      input.run_id,
      input.policy_id,
      input.video_id,
      input.cue_id,
      input.start_ms,
      input.snippet,
      input.base_score,
      input.priority_score,
      input.priority_bucket,
      JSON.stringify(input.reasons),
    ]
  );
  return PolicyHitSchema.parse(res.rows[0]);
}

export async function listPolicyHits(
  client: pg.PoolClient,
  policyId: string,
  opts?: { run_id?: string; bucket?: PriorityBucket; limit?: number; offset?: number }
): Promise<PolicyHit[]> {
  const limit = Math.min(opts?.limit ?? 100, 500);
  const offset = Math.max(0, opts?.offset ?? 0);
  const res = await client.query(
    `
    SELECT
      id::text as id,
      run_id::text as run_id,
      policy_id::text as policy_id,
      video_id::text as video_id,
      cue_id::text as cue_id,
      start_ms,
      snippet,
      base_score,
      priority_score,
      priority_bucket,
      reasons_json as reasons,
      created_at::text as created_at
    FROM policy_hits
    WHERE policy_id = $1
      AND ($2::uuid IS NULL OR run_id = $2::uuid)
      AND ($3::text IS NULL OR priority_bucket = $3::text)
    ORDER BY priority_score DESC, created_at DESC
    LIMIT $4
    OFFSET $5
    `,
    [policyId, opts?.run_id ?? null, opts?.bucket ?? null, limit, offset]
  );
  return res.rows.map((r) => PolicyHitSchema.parse(r));
}

export async function listPolicyFeedItems(
  client: pg.PoolClient,
  input: {
    policy_id: string;
    run_id: string;
    buckets?: PriorityBucket[];
    limit?: number;
  }
): Promise<PolicyFeedItem[]> {
  const limit = Math.min(input.limit ?? 100, 500);
  const buckets = input.buckets && input.buckets.length ? input.buckets : null;
  const res = await client.query(
    `
    SELECT
      h.id::text as hit_id,
      h.run_id::text as run_id,
      h.video_id::text as video_id,
      v.provider_video_id,
      v.url as video_url,
      v.title,
      v.channel_name,
      h.start_ms,
      h.snippet,
      h.priority_score,
      h.priority_bucket,
      h.reasons_json as reasons,
      r.finished_at::text as run_finished_at
    FROM policy_hits h
    JOIN videos v ON v.id = h.video_id
    JOIN policy_runs r ON r.id = h.run_id
    WHERE h.policy_id = $1
      AND h.run_id = $2
      AND ($3::text[] IS NULL OR h.priority_bucket = ANY($3::text[]))
    ORDER BY h.priority_score DESC, h.start_ms ASC
    LIMIT $4
    `,
    [input.policy_id, input.run_id, buckets, limit]
  );
  return res.rows.map((r) => PolicyFeedItemSchema.parse(r));
}

export async function getVideoRecencyMap(
  client: pg.PoolClient,
  videoIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!videoIds.length) return map;

  const res = await client.query(
    `
    SELECT
      video_id::text as video_id,
      MAX(fetched_at)::text as latest_fetched_at
    FROM transcripts
    WHERE video_id = ANY($1::uuid[])
    GROUP BY video_id
    `,
    [videoIds]
  );

  for (const row of res.rows) {
    const ms = new Date(String(row.latest_fetched_at)).getTime();
    if (Number.isFinite(ms)) map.set(String(row.video_id), ms);
  }
  return map;
}
