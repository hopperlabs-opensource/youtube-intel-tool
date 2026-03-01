import { NextResponse } from "next/server";
import {
  createKaraokeScoreEvent,
  getKaraokeQueueItemById,
  getKaraokeSessionById,
  getPool,
  initMetrics,
  listKaraokeLeaderboard,
} from "@yt/core";
import { RecordKaraokeScoreEventRequestSchema, RecordKaraokeScoreEventResponseSchema } from "@yt/contracts";
import { jsonError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  const metrics = initMetrics();
  try {
    const { sessionId } = await ctx.params;
    const body = RecordKaraokeScoreEventRequestSchema.parse(await req.json().catch(() => ({})));

    const pool = getPool();
    const client = await pool.connect();
    try {
      const session = await getKaraokeSessionById(client, sessionId);
      if (!session) {
        metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId/scores/events", method: "POST", status: "404" });
        return jsonError("not_found", "session not found", { status: 404 });
      }

      const queueItem = await getKaraokeQueueItemById(client, body.queue_item_id);
      if (!queueItem || queueItem.session_id !== session.id) {
        metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId/scores/events", method: "POST", status: "404" });
        return jsonError("not_found", "queue item not found", { status: 404 });
      }

      const event = await createKaraokeScoreEvent(client, {
        session_id: session.id,
        queue_item_id: body.queue_item_id,
        player_name: body.player_name,
        cue_id: body.cue_id,
        expected_at_ms: body.expected_at_ms,
        actual_at_ms: body.actual_at_ms,
      });

      const leaderboard = await listKaraokeLeaderboard(client, session.id);

      metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId/scores/events", method: "POST", status: "200" });
      return NextResponse.json(RecordKaraokeScoreEventResponseSchema.parse({ event, leaderboard }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId/scores/events", method: "POST", status: "400" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("invalid_request", msg, { status: 400 });
  }
}
