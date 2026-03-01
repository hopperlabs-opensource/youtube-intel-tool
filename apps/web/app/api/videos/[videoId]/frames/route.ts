import { NextResponse } from "next/server";
import { getPool, initMetrics } from "@yt/core";
import { getFramesByVideo } from "@yt/core";
import { ListFramesResponseSchema } from "@yt/contracts";
import { jsonError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ videoId: string }> }) {
  const metrics = initMetrics();
  try {
    const { videoId } = await ctx.params;
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") || 100), 1000);
    const offset = Number(url.searchParams.get("offset") || 0);

    const pool = getPool();
    const client = await pool.connect();
    try {
      const frames = await getFramesByVideo(client, videoId, { limit, offset });

      metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/frames", method: "GET", status: "200" });
      return NextResponse.json(ListFramesResponseSchema.parse({ frames }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/frames", method: "GET", status: "500" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("internal_error", msg, { status: 500 });
  }
}
