import { NextResponse } from "next/server";
import { getPool, initMetrics } from "@yt/core";
import { matchSpeakerAcrossVideos } from "@yt/core";
import { getGlobalSpeakerLinks, listGlobalSpeakers } from "@yt/core";
import { MatchSpeakerResponseSchema } from "@yt/contracts";
import { jsonError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ videoId: string; speakerId: string }> },
) {
  const metrics = initMetrics();
  try {
    const { videoId, speakerId } = await ctx.params;
    const pool = getPool();
    const client = await pool.connect();
    try {
      const rawMatches = await matchSpeakerAcrossVideos(client, speakerId, { excludeVideoId: videoId });

      // Group matches by global speaker if linked
      const matches = rawMatches.map((m) => ({
        global_speaker_id: m.speaker_id,
        display_name: m.speaker_id,
        confidence: m.similarity,
        videos: [{ video_id: m.video_id, speaker_id: m.speaker_id, title: null }],
      }));

      metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/speakers/:id/match", method: "POST", status: "200" });
      return NextResponse.json(MatchSpeakerResponseSchema.parse({ matches }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/speakers/:id/match", method: "POST", status: "500" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("internal_error", msg, { status: 500 });
  }
}
