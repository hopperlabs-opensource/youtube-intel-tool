import { NextResponse } from "next/server";
import { getPool, initMetrics } from "@yt/core";
import { getSpeakerEmbedding } from "@yt/core";
import { GetSpeakerVoiceResponseSchema } from "@yt/contracts";
import { jsonError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ videoId: string; speakerId: string }> },
) {
  const metrics = initMetrics();
  try {
    const { speakerId } = await ctx.params;
    const pool = getPool();
    const client = await pool.connect();
    try {
      const embedding = await getSpeakerEmbedding(client, speakerId);
      metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/speakers/:id/voice", method: "GET", status: "200" });
      return NextResponse.json(GetSpeakerVoiceResponseSchema.parse({ embedding: embedding ?? null }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/speakers/:id/voice", method: "GET", status: "500" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("internal_error", msg, { status: 500 });
  }
}
