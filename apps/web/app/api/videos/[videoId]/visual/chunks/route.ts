import { NextResponse } from "next/server";
import { getPool, initMetrics } from "@yt/core";
import { getFrameChunksByVideo } from "@yt/core";
import { ListFrameChunksResponseSchema } from "@yt/contracts";
import { jsonError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ videoId: string }> }) {
  const metrics = initMetrics();
  try {
    const { videoId } = await ctx.params;
    const pool = getPool();
    const client = await pool.connect();
    try {
      const chunks = await getFrameChunksByVideo(client, videoId);

      metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/visual/chunks", method: "GET", status: "200" });
      return NextResponse.json(ListFrameChunksResponseSchema.parse({ chunks }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/visual/chunks", method: "GET", status: "500" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("internal_error", msg, { status: 500 });
  }
}
