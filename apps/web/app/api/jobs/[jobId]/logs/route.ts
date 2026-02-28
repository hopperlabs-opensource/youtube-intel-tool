import { NextResponse } from "next/server";
import { getPool, initMetrics, listJobLogs } from "@yt/core";
import { ListJobLogsResponseSchema } from "@yt/contracts";
import { jsonError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const metrics = initMetrics();
  try {
    const { jobId } = await ctx.params;
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") || "500");

    const pool = getPool();
    const client = await pool.connect();
    try {
      const logs = await listJobLogs(client, jobId, { limit });
      metrics.httpRequestsTotal.inc({ route: "/api/jobs/:id/logs", method: "GET", status: "200" });
      return NextResponse.json(ListJobLogsResponseSchema.parse({ logs }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/jobs/:id/logs", method: "GET", status: "400" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("invalid_request", msg, { status: 400 });
  }
}
