import { NextResponse } from "next/server";
import {
  getKaraokePlaylistById,
  getKaraokeSessionById,
  getPool,
  initMetrics,
  queueKaraokePlaylistToSession,
} from "@yt/core";
import { QueueFromKaraokePlaylistRequestSchema, QueueFromKaraokePlaylistResponseSchema } from "@yt/contracts";
import { jsonError, classifyApiError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  const metrics = initMetrics();
  try {
    const { sessionId } = await ctx.params;
    const body = QueueFromKaraokePlaylistRequestSchema.parse(await req.json().catch(() => ({})));

    const pool = getPool();
    const client = await pool.connect();
    try {
      const session = await getKaraokeSessionById(client, sessionId);
      if (!session) {
        metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId/queue/from-playlist", method: "POST", status: "404" });
        return jsonError("not_found", "session not found", { status: 404 });
      }

      const playlist = await getKaraokePlaylistById(client, body.playlist_id);
      if (!playlist) {
        metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId/queue/from-playlist", method: "POST", status: "404" });
        return jsonError("not_found", "playlist not found", { status: 404 });
      }

      await client.query("BEGIN");
      try {
        const added = await queueKaraokePlaylistToSession(client, {
          session_id: session.id,
          playlist_id: playlist.id,
          requested_by: body.requested_by,
        });
        await client.query("COMMIT");
        metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId/queue/from-playlist", method: "POST", status: "200" });
        return NextResponse.json(QueueFromKaraokePlaylistResponseSchema.parse({ added }));
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const apiErr = classifyApiError(err);
    metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId/queue/from-playlist", method: "POST", status: String(apiErr.status) });
    return jsonError(apiErr.code, apiErr.message, { status: apiErr.status, details: apiErr.details });
  }
}
