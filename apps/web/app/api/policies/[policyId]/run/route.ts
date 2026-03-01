import { NextResponse } from "next/server";
import { getPool, getSavedPolicyById, initMetrics, runPolicyNow } from "@yt/core";
import { RunPolicyRequestSchema, RunPolicyResponseSchema } from "@yt/contracts";
import { jsonError, classifyApiError } from "@/lib/server/api";
import { getEmbeddingsEnvForRequest } from "@/lib/server/openai_key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ policyId: string }> }) {
  const metrics = initMetrics();
  try {
    const { policyId } = await ctx.params;
    const body = RunPolicyRequestSchema.parse(await req.json().catch(() => ({})));

    const pool = getPool();
    const client = await pool.connect();
    try {
      const policy = await getSavedPolicyById(client, policyId);
      if (!policy) return jsonError("not_found", "policy not found", { status: 404 });
      if (!policy.enabled) return jsonError("invalid_request", "policy is disabled", { status: 400 });

      const result = await runPolicyNow(client, {
        policy,
        triggered_by: body.triggered_by,
        embeddingsEnv: getEmbeddingsEnvForRequest(req),
      });
      metrics.httpRequestsTotal.inc({ route: "/api/policies/:id/run", method: "POST", status: "200" });
      return NextResponse.json(
        RunPolicyResponseSchema.parse({
          run: result.run,
          hits_count: result.hits.length,
        })
      );
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const apiErr = classifyApiError(err);
    metrics.httpRequestsTotal.inc({ route: "/api/policies/:id/run", method: "POST", status: String(apiErr.status) });
    return jsonError(apiErr.code, apiErr.message, { status: apiErr.status, details: apiErr.details });
  }
}
