import { NextResponse } from "next/server";
import { getPool, getSavedPolicyById, initMetrics, listPolicyHits } from "@yt/core";
import { ListPolicyHitsResponseSchema, PriorityBucketSchema } from "@yt/contracts";
import { jsonError, classifyApiError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ policyId: string }> }) {
  const metrics = initMetrics();
  try {
    const { policyId } = await ctx.params;
    const url = new URL(req.url);
    const run_id = url.searchParams.get("run_id") ?? undefined;
    const bucketRaw = url.searchParams.get("bucket");
    const limit = url.searchParams.get("limit");
    const offset = url.searchParams.get("offset");

    const bucket = (() => {
      if (!bucketRaw) return undefined;
      const parsed = PriorityBucketSchema.safeParse(bucketRaw);
      if (!parsed.success) throw new Error(`invalid bucket: ${bucketRaw}`);
      return parsed.data;
    })();

    const pool = getPool();
    const client = await pool.connect();
    try {
      const policy = await getSavedPolicyById(client, policyId);
      if (!policy) return jsonError("not_found", "policy not found", { status: 404 });
      const hits = await listPolicyHits(client, policyId, {
        run_id,
        bucket,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      });
      metrics.httpRequestsTotal.inc({ route: "/api/policies/:id/hits", method: "GET", status: "200" });
      return NextResponse.json(ListPolicyHitsResponseSchema.parse({ hits }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const apiErr = classifyApiError(err);
    metrics.httpRequestsTotal.inc({ route: "/api/policies/:id/hits", method: "GET", status: String(apiErr.status) });
    return jsonError(apiErr.code, apiErr.message, { status: apiErr.status, details: apiErr.details });
  }
}
