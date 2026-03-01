import { NextResponse } from "next/server";
import {
  getKaraokeQueueItemById,
  getKaraokeSessionById,
  getPool,
  initMetrics,
  listKaraokeQueueForSession,
  moveKaraokeQueueItem,
  setKaraokeQueueItemStatus,
  updateKaraokeSession,
} from "@yt/core";
import { UpdateKaraokeQueueItemRequestSchema, UpdateKaraokeQueueItemResponseSchema } from "@yt/contracts";
import { jsonError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ sessionId: string; itemId: string }> }) {
  const metrics = initMetrics();
  try {
    const { sessionId, itemId } = await ctx.params;
    const body = UpdateKaraokeQueueItemRequestSchema.parse(await req.json().catch(() => ({})));

    const pool = getPool();
    const client = await pool.connect();
    try {
      const session = await getKaraokeSessionById(client, sessionId);
      if (!session) {
        metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId/queue/:itemId", method: "PATCH", status: "404" });
        return jsonError("not_found", "session not found", { status: 404 });
      }

      const current = await getKaraokeQueueItemById(client, itemId);
      if (!current || current.session_id !== session.id) {
        metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId/queue/:itemId", method: "PATCH", status: "404" });
        return jsonError("not_found", "queue item not found", { status: 404 });
      }

      let item = current;
      if (body.action === "move") {
        if (body.new_position === undefined) {
          metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId/queue/:itemId", method: "PATCH", status: "400" });
          return jsonError("invalid_request", "new_position is required for move action", { status: 400 });
        }
        item = await moveKaraokeQueueItem(client, {
          session_id: session.id,
          item_id: current.id,
          new_position: body.new_position,
        });
      } else if (body.action === "play_now") {
        item = await setKaraokeQueueItemStatus(client, { item_id: current.id, status: "playing" });
        await updateKaraokeSession(client, session.id, { status: "active" });
      } else if (body.action === "skip") {
        item = await setKaraokeQueueItemStatus(client, { item_id: current.id, status: "skipped" });
      } else if (body.action === "complete") {
        item = await setKaraokeQueueItemStatus(client, { item_id: current.id, status: "completed" });
      }

      const queue = await listKaraokeQueueForSession(client, session.id);
      metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId/queue/:itemId", method: "PATCH", status: "200" });
      return NextResponse.json(UpdateKaraokeQueueItemResponseSchema.parse({ item, queue }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId/queue/:itemId", method: "PATCH", status: "400" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("invalid_request", msg, { status: 400 });
  }
}
