import { NextResponse } from "next/server";
import { getPool, initMetrics } from "@yt/core";
import { countVisualData, getVisualJobMeta } from "@yt/core";
import { GetVisualStatusResponseSchema } from "@yt/contracts";
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
      const counts = await countVisualData(client, videoId);
      const meta = await getVisualJobMeta(client, videoId);

      const status = {
        video_id: videoId,
        has_visual: counts.frames > 0,
        frames_extracted: counts.frames,
        frames_analyzed: counts.analyses,
        frame_chunks: counts.chunks,
        visual_embeddings: counts.embeddings,
        total_tokens_used: meta?.total_tokens_used ?? null,
        vision_provider: meta?.vision_provider ?? null,
        vision_model: meta?.vision_model ?? null,
        extraction_strategy: meta?.extraction_strategy ?? null,
        completed_at: meta?.completed_at ?? null,
      };

      metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/visual/status", method: "GET", status: "200" });
      return NextResponse.json(GetVisualStatusResponseSchema.parse({ status }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/visual/status", method: "GET", status: "500" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("internal_error", msg, { status: 500 });
  }
}
