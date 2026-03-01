import { NextResponse } from "next/server";
import { getPool, getVideoById, initMetrics } from "@yt/core";
import { GetVideoResponseSchema } from "@yt/contracts";
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
      const video = await getVideoById(client, videoId);
      if (!video) return jsonError("not_found", "video not found", { status: 404 });
      metrics.httpRequestsTotal.inc({ route: "/api/videos/:id", method: "GET", status: "200" });
      return NextResponse.json(GetVideoResponseSchema.parse({ video }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const apiErr = classifyApiError(err);
    metrics.httpRequestsTotal.inc({ route: "/api/videos/:id", method: "GET", status: String(apiErr.status) });
    return jsonError(apiErr.code, apiErr.message, { status: apiErr.status, details: apiErr.details });
  }
}
