import { NextResponse } from "next/server";
import { getPool, initMetrics, listEntitiesForVideoInWindow } from "@yt/core";
import { ListEntitiesResponseSchema } from "@yt/contracts";
import { jsonError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ videoId: string }> }) {
  const metrics = initMetrics();
  try {
    const { videoId } = await ctx.params;
    const url = new URL(req.url);
    const at_ms = url.searchParams.get("at_ms");
    const window_ms = url.searchParams.get("window_ms");

    const pool = getPool();
    const client = await pool.connect();
    try {
      const entities = await listEntitiesForVideoInWindow(client, videoId, {
        at_ms: at_ms ? Number(at_ms) : undefined,
        window_ms: window_ms ? Number(window_ms) : undefined,
        limit: 200,
      });
      metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/entities", method: "GET", status: "200" });
      return NextResponse.json(ListEntitiesResponseSchema.parse({ entities }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/entities", method: "GET", status: "400" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("invalid_request", msg, { status: 400 });
  }
}
