import { NextResponse } from "next/server";
import { getLatestCompletedPolicyRun, getPool, getSavedPolicyById, initMetrics, updateSavedPolicy } from "@yt/core";
import { GetPolicyResponseSchema, UpdatePolicyRequestSchema, UpdatePolicyResponseSchema } from "@yt/contracts";
import { jsonError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ policyId: string }> }) {
  const metrics = initMetrics();
  try {
    const { policyId } = await ctx.params;
    const pool = getPool();
    const client = await pool.connect();
    try {
      const policy = await getSavedPolicyById(client, policyId);
      if (!policy) return jsonError("not_found", "policy not found", { status: 404 });
      const latest_run = await getLatestCompletedPolicyRun(client, policyId);
      metrics.httpRequestsTotal.inc({ route: "/api/policies/:id", method: "GET", status: "200" });
      return NextResponse.json(GetPolicyResponseSchema.parse({ policy, latest_run }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/policies/:id", method: "GET", status: "400" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("invalid_request", msg, { status: 400 });
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ policyId: string }> }) {
  const metrics = initMetrics();
  try {
    const { policyId } = await ctx.params;
    const body = UpdatePolicyRequestSchema.parse(await req.json().catch(() => ({})));
    const hasMutation =
      body.name !== undefined ||
      Object.prototype.hasOwnProperty.call(body, "description") ||
      body.enabled !== undefined ||
      body.search_payload !== undefined ||
      body.priority_config !== undefined ||
      body.rotate_feed_token;
    if (!hasMutation) return jsonError("invalid_request", "no updates specified", { status: 400 });
    const pool = getPool();
    const client = await pool.connect();
    try {
      const policy = await updateSavedPolicy(client, policyId, body);
      if (!policy) return jsonError("not_found", "policy not found", { status: 404 });
      metrics.httpRequestsTotal.inc({ route: "/api/policies/:id", method: "PATCH", status: "200" });
      return NextResponse.json(UpdatePolicyResponseSchema.parse({ policy }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/policies/:id", method: "PATCH", status: "400" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("invalid_request", msg, { status: 400 });
  }
}
