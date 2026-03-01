import { NextResponse } from "next/server";
import {
  getKaraokeQueueItemById,
  getKaraokeSessionById,
  getPool,
  initMetrics,
  setKaraokeQueueItemStatus,
  updateKaraokeSession,
} from "@yt/core";
import { StartKaraokeRoundRequestSchema, StartKaraokeRoundResponseSchema } from "@yt/contracts";
import { jsonError, classifyApiError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  const metrics = initMetrics();
  try {
    const { sessionId } = await ctx.params;
    const body = StartKaraokeRoundRequestSchema.parse(await req.json().catch(() => ({})));

    const pool = getPool();
    const client = await pool.connect();
    try {
      const session = await getKaraokeSessionById(client, sessionId);
      if (!session) {
        metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId/rounds/start", method: "POST", status: "404" });
        return jsonError("not_found", "session not found", { status: 404 });
      }

      const item = await getKaraokeQueueItemById(client, body.queue_item_id);
      if (!item || item.session_id !== session.id) {
        metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId/rounds/start", method: "POST", status: "404" });
        return jsonError("not_found", "queue item not found", { status: 404 });
      }

      const started = await setKaraokeQueueItemStatus(client, { item_id: item.id, status: "playing" });
      await updateKaraokeSession(client, session.id, { status: "active" });

      metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId/rounds/start", method: "POST", status: "200" });
      return NextResponse.json(StartKaraokeRoundResponseSchema.parse({ item: started }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const apiErr = classifyApiError(err);
    metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId/rounds/start", method: "POST", status: String(apiErr.status) });
    return jsonError(apiErr.code, apiErr.message, { status: apiErr.status, details: apiErr.details });
  }
}
