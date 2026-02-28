import { NextResponse } from "next/server";
import { getPool, initMetrics, listSpeakerSegmentsForVideo } from "@yt/core";
import { ListSpeakerSegmentsResponseSchema } from "@yt/contracts";
import { jsonError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ videoId: string }> }) {
  const metrics = initMetrics();
  try {
    const { videoId } = await ctx.params;
    const url = new URL(req.url);
    const transcript_id = url.searchParams.get("transcript_id");
    const limit = url.searchParams.get("limit");

    const pool = getPool();
    const client = await pool.connect();
    try {
      const segments = await listSpeakerSegmentsForVideo(client, {
        video_id: videoId,
        transcript_id: transcript_id || null,
        limit: limit ? Number(limit) : undefined,
      });
      metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/speakers/segments", method: "GET", status: "200" });
      return NextResponse.json(ListSpeakerSegmentsResponseSchema.parse({ segments }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/speakers/segments", method: "GET", status: "400" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("invalid_request", msg, { status: 400 });
  }
}

