import { NextResponse } from "next/server";
import { getPool, initMetrics, listVideoChapters } from "@yt/core";
import { ListVideoChaptersResponseSchema } from "@yt/contracts";
import { jsonError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ videoId: string }> }) {
  const metrics = initMetrics();
  try {
    const { videoId } = await ctx.params;
    const url = new URL(req.url);
    const source = url.searchParams.get("source") || undefined;

    const pool = getPool();
    const client = await pool.connect();
    try {
      const chapters = await listVideoChapters(client, videoId, { source });
      metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/chapters", method: "GET", status: "200" });
      return NextResponse.json(ListVideoChaptersResponseSchema.parse({ chapters }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/chapters", method: "GET", status: "400" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("invalid_request", msg, { status: 400 });
  }
}

