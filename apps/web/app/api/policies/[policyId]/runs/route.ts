import { NextResponse } from "next/server";
import { getPool, getSavedPolicyById, initMetrics, listPolicyRuns } from "@yt/core";
import { ListPolicyRunsResponseSchema } from "@yt/contracts";
import { jsonError, classifyApiError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ policyId: string }> }) {
  const metrics = initMetrics();
  try {
    const { policyId } = await ctx.params;
    const url = new URL(req.url);
    const limit = url.searchParams.get("limit");
    const offset = url.searchParams.get("offset");

    const pool = getPool();
    const client = await pool.connect();
    try {
      const policy = await getSavedPolicyById(client, policyId);
      if (!policy) return jsonError("not_found", "policy not found", { status: 404 });
      const runs = await listPolicyRuns(client, policyId, {
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      });
      metrics.httpRequestsTotal.inc({ route: "/api/policies/:id/runs", method: "GET", status: "200" });
      return NextResponse.json(ListPolicyRunsResponseSchema.parse({ runs }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const apiErr = classifyApiError(err);
    metrics.httpRequestsTotal.inc({ route: "/api/policies/:id/runs", method: "GET", status: String(apiErr.status) });
    return jsonError(apiErr.code, apiErr.message, { status: apiErr.status, details: apiErr.details });
  }
}
