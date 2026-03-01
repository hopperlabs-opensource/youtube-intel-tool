import { NextResponse } from "next/server";
import { getKaraokeSessionById, getPool, initMetrics, listKaraokeLeaderboard } from "@yt/core";
import { GetKaraokeLeaderboardResponseSchema } from "@yt/contracts";
import { jsonError, classifyApiError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  const metrics = initMetrics();
  try {
    const { sessionId } = await ctx.params;

    const pool = getPool();
    const client = await pool.connect();
    try {
      const session = await getKaraokeSessionById(client, sessionId);
      if (!session) {
        metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId/leaderboard", method: "GET", status: "404" });
        return jsonError("not_found", "session not found", { status: 404 });
      }
      const entries = await listKaraokeLeaderboard(client, session.id);
      metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId/leaderboard", method: "GET", status: "200" });
      return NextResponse.json(GetKaraokeLeaderboardResponseSchema.parse({ entries }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const apiErr = classifyApiError(err);
    metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId/leaderboard", method: "GET", status: String(apiErr.status) });
    return jsonError(apiErr.code, apiErr.message, { status: apiErr.status, details: apiErr.details });
  }
}
