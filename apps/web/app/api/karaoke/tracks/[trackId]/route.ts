import { NextResponse } from "next/server";
import { getKaraokeTrackById, getPool, initMetrics } from "@yt/core";
import { GetKaraokeTrackResponseSchema } from "@yt/contracts";
import { jsonError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ trackId: string }> }) {
  const metrics = initMetrics();
  try {
    const { trackId } = await ctx.params;
    const pool = getPool();
    const client = await pool.connect();
    try {
      const track = await getKaraokeTrackById(client, trackId);
      if (!track) {
        metrics.httpRequestsTotal.inc({ route: "/api/karaoke/tracks/:trackId", method: "GET", status: "404" });
        return jsonError("not_found", "track not found", { status: 404 });
      }
      metrics.httpRequestsTotal.inc({ route: "/api/karaoke/tracks/:trackId", method: "GET", status: "200" });
      return NextResponse.json(GetKaraokeTrackResponseSchema.parse({ track }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/karaoke/tracks/:trackId", method: "GET", status: "400" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("invalid_request", msg, { status: 400 });
  }
}
