import { NextResponse } from "next/server";
import { addKaraokeQueueItem, getKaraokeSessionById, getKaraokeTrackById, getPool, initMetrics } from "@yt/core";
import { AddKaraokeQueueItemRequestSchema, AddKaraokeQueueItemResponseSchema } from "@yt/contracts";
import { jsonError, classifyApiError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  const metrics = initMetrics();
  try {
    const { sessionId } = await ctx.params;
    const body = AddKaraokeQueueItemRequestSchema.parse(await req.json().catch(() => ({})));

    const pool = getPool();
    const client = await pool.connect();
    try {
      const session = await getKaraokeSessionById(client, sessionId);
      if (!session) {
        metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId/queue", method: "POST", status: "404" });
        return jsonError("not_found", "session not found", { status: 404 });
      }

      const track = await getKaraokeTrackById(client, body.track_id);
      if (!track) {
        metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId/queue", method: "POST", status: "404" });
        return jsonError("not_found", "track not found", { status: 404 });
      }

      const item = await addKaraokeQueueItem(client, {
        session_id: session.id,
        track_id: track.id,
        requested_by: body.requested_by,
      });

      metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId/queue", method: "POST", status: "200" });
      return NextResponse.json(AddKaraokeQueueItemResponseSchema.parse({ item }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const apiErr = classifyApiError(err);
    metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId/queue", method: "POST", status: String(apiErr.status) });
    return jsonError(apiErr.code, apiErr.message, { status: apiErr.status, details: apiErr.details });
  }
}
