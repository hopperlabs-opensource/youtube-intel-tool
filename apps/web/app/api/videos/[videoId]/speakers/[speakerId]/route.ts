import { NextResponse } from "next/server";
import { getPool, initMetrics, updateVideoSpeakerLabel } from "@yt/core";
import { UpdateVideoSpeakerRequestSchema, UpdateVideoSpeakerResponseSchema } from "@yt/contracts";
import { jsonError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ videoId: string; speakerId: string }> }) {
  const metrics = initMetrics();
  try {
    const { videoId, speakerId } = await ctx.params;
    const body = UpdateVideoSpeakerRequestSchema.parse(await req.json().catch(() => ({})));

    const pool = getPool();
    const client = await pool.connect();
    try {
      const speaker = await updateVideoSpeakerLabel(client, { video_id: videoId, speaker_id: speakerId, label: body.label });
      metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/speakers/:speakerId", method: "PATCH", status: "200" });
      return NextResponse.json(UpdateVideoSpeakerResponseSchema.parse({ speaker }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/speakers/:speakerId", method: "PATCH", status: "400" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("invalid_request", msg, { status: 400 });
  }
}

