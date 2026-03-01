import { NextResponse } from "next/server";
import { getKaraokeSessionById, getPool, initMetrics, listKaraokeGuestRequests } from "@yt/core";
import { ListKaraokeGuestRequestsResponseSchema } from "@yt/contracts";
import { jsonError } from "@/lib/server/api";

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
        metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId/guest-requests", method: "GET", status: "404" });
        return jsonError("not_found", "session not found", { status: 404 });
      }
      const requests = await listKaraokeGuestRequests(client, session.id);
      metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId/guest-requests", method: "GET", status: "200" });
      return NextResponse.json(ListKaraokeGuestRequestsResponseSchema.parse({ requests }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId/guest-requests", method: "GET", status: "400" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("invalid_request", msg, { status: 400 });
  }
}
