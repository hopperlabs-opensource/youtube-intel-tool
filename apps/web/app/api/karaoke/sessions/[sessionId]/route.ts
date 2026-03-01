import { NextResponse } from "next/server";
import {
  getActiveKaraokeQueueItem,
  getKaraokeSessionById,
  getPool,
  initMetrics,
  listKaraokeLeaderboard,
  listKaraokeQueueForSession,
  updateKaraokeSession,
} from "@yt/core";
import {
  GetKaraokeSessionResponseSchema,
  UpdateKaraokeSessionRequestSchema,
  UpdateKaraokeSessionResponseSchema,
} from "@yt/contracts";
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
        metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId", method: "GET", status: "404" });
        return jsonError("not_found", "session not found", { status: 404 });
      }

      const [queue, active_item, leaderboard] = await Promise.all([
        listKaraokeQueueForSession(client, session.id),
        getActiveKaraokeQueueItem(client, session.id),
        listKaraokeLeaderboard(client, session.id),
      ]);

      metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId", method: "GET", status: "200" });
      return NextResponse.json(GetKaraokeSessionResponseSchema.parse({ session, queue, active_item, leaderboard }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const apiErr = classifyApiError(err);
    metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId", method: "GET", status: String(apiErr.status) });
    return jsonError(apiErr.code, apiErr.message, { status: apiErr.status, details: apiErr.details });
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  const metrics = initMetrics();
  try {
    const { sessionId } = await ctx.params;
    const body = UpdateKaraokeSessionRequestSchema.parse(await req.json().catch(() => ({})));

    const pool = getPool();
    const client = await pool.connect();
    try {
      const session = await updateKaraokeSession(client, sessionId, {
        name: body.name,
        status: body.status,
        theme_id: body.theme_id,
      });
      if (!session) {
        metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId", method: "PATCH", status: "404" });
        return jsonError("not_found", "session not found", { status: 404 });
      }

      metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId", method: "PATCH", status: "200" });
      return NextResponse.json(UpdateKaraokeSessionResponseSchema.parse({ session }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const apiErr = classifyApiError(err);
    metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId", method: "PATCH", status: String(apiErr.status) });
    return jsonError(apiErr.code, apiErr.message, { status: apiErr.status, details: apiErr.details });
  }
}
