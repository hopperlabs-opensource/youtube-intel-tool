import { NextResponse } from "next/server";
import { getPool, initMetrics, listVideoSpeakers } from "@yt/core";
import { ListVideoSpeakersResponseSchema } from "@yt/contracts";
import { jsonError, classifyApiError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ videoId: string }> }) {
  const metrics = initMetrics();
  try {
    const { videoId } = await ctx.params;

    const pool = getPool();
    const client = await pool.connect();
    try {
      const speakers = await listVideoSpeakers(client, videoId);
      metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/speakers", method: "GET", status: "200" });
      return NextResponse.json(ListVideoSpeakersResponseSchema.parse({ speakers }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const apiErr = classifyApiError(err);
    metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/speakers", method: "GET", status: String(apiErr.status) });
    return jsonError(apiErr.code, apiErr.message, { status: apiErr.status, details: apiErr.details });
  }
}

