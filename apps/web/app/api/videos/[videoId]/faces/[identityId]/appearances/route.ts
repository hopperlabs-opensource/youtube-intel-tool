import { NextResponse } from "next/server";
import { getPool, initMetrics } from "@yt/core";
import { listFaceAppearancesByVideo } from "@yt/core";
import { ListFaceAppearancesResponseSchema } from "@yt/contracts";
import { jsonError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ videoId: string; identityId: string }> },
) {
  const metrics = initMetrics();
  try {
    const { videoId, identityId } = await ctx.params;
    const pool = getPool();
    const client = await pool.connect();
    try {
      const appearances = await listFaceAppearancesByVideo(client, videoId, { identity_id: identityId });
      metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/faces/:id/appearances", method: "GET", status: "200" });
      return NextResponse.json(ListFaceAppearancesResponseSchema.parse({ appearances }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/faces/:id/appearances", method: "GET", status: "500" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("internal_error", msg, { status: 500 });
  }
}
