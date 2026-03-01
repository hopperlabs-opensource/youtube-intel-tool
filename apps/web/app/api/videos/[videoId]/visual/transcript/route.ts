import { NextResponse } from "next/server";
import { getPool, initMetrics } from "@yt/core";
import { getFrameAnalysesByVideo, getVisualJobMeta } from "@yt/core";
import { GetActionTranscriptResponseSchema } from "@yt/contracts";
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
      const analyses = await getFrameAnalysesByVideo(client, videoId);
      const meta = await getVisualJobMeta(client, videoId);

      const transcript = {
        video_id: videoId,
        cues: analyses.map((a) => ({
          frame_id: a.frame_id,
          timestamp_ms: a.start_ms,
          start_ms: a.start_ms,
          end_ms: a.end_ms,
          description: a.description,
          objects: a.objects || [],
          text_overlay: a.text_overlay,
          scene_type: a.scene_type,
        })),
        total_frames: meta?.total_frames_extracted ?? analyses.length,
        total_analyzed: analyses.length,
        provider: meta?.vision_provider ?? "unknown",
        model: meta?.vision_model ?? "unknown",
      };

      metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/visual/transcript", method: "GET", status: "200" });
      return NextResponse.json(GetActionTranscriptResponseSchema.parse({ transcript }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/visual/transcript", method: "GET", status: "500" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("internal_error", msg, { status: 500 });
  }
}
