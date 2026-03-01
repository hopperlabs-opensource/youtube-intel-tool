import { NextResponse } from "next/server";
import { getPool, initMetrics } from "@yt/core";
import { listSignificantMarks } from "@yt/core";
import { ListSignificantMarksResponseSchema } from "@yt/contracts";
import { jsonError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ videoId: string }> }) {
  const metrics = initMetrics();
  try {
    const { videoId } = await ctx.params;
    const url = new URL(req.url);
    const markType = url.searchParams.get("type") ?? undefined;
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 1000);

    const pool = getPool();
    const client = await pool.connect();
    try {
      const marks = await listSignificantMarks(client, videoId, { mark_type: markType, limit });

      metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/marks", method: "GET", status: "200" });
      return NextResponse.json(ListSignificantMarksResponseSchema.parse({ marks }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/marks", method: "GET", status: "500" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("internal_error", msg, { status: 500 });
  }
}
