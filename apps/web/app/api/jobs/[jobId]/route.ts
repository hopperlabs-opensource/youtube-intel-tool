import { NextResponse } from "next/server";
import { getJobById, getPool, initMetrics } from "@yt/core";
import { GetJobResponseSchema } from "@yt/contracts";
import { jsonError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const metrics = initMetrics();
  try {
    const { jobId } = await ctx.params;
    const pool = getPool();
    const client = await pool.connect();
    try {
      const job = await getJobById(client, jobId);
      if (!job) return jsonError("not_found", "job not found", { status: 404 });
      metrics.httpRequestsTotal.inc({ route: "/api/jobs/:id", method: "GET", status: "200" });
      return NextResponse.json(GetJobResponseSchema.parse({ job }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/jobs/:id", method: "GET", status: "400" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("invalid_request", msg, { status: 400 });
  }
}
