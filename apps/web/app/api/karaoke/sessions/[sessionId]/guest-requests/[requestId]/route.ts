import { NextResponse } from "next/server";
import {
  addKaraokeQueueItem,
  getKaraokeGuestRequestById,
  getKaraokeSessionById,
  getPool,
  initMetrics,
  setKaraokeGuestRequestStatus,
} from "@yt/core";
import { UpdateKaraokeGuestRequestRequestSchema, UpdateKaraokeGuestRequestResponseSchema } from "@yt/contracts";
import { jsonError, classifyApiError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ sessionId: string; requestId: string }> }) {
  const metrics = initMetrics();
  try {
    const { sessionId, requestId } = await ctx.params;
    const body = UpdateKaraokeGuestRequestRequestSchema.parse(await req.json().catch(() => ({})));

    const pool = getPool();
    const client = await pool.connect();
    try {
      const session = await getKaraokeSessionById(client, sessionId);
      if (!session) {
        metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId/guest-requests/:requestId", method: "PATCH", status: "404" });
        return jsonError("not_found", "session not found", { status: 404 });
      }

      const requestRow = await getKaraokeGuestRequestById(client, requestId);
      if (!requestRow || requestRow.session_id !== session.id) {
        metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId/guest-requests/:requestId", method: "PATCH", status: "404" });
        return jsonError("not_found", "guest request not found", { status: 404 });
      }

      await client.query("BEGIN");
      try {
        if (body.action === "reject") {
          const request = await setKaraokeGuestRequestStatus(client, { request_id: requestRow.id, status: "rejected" });
          if (!request) throw new Error("guest request not found");
          await client.query("COMMIT");
          metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId/guest-requests/:requestId", method: "PATCH", status: "200" });
          return NextResponse.json(UpdateKaraokeGuestRequestResponseSchema.parse({ request, queue_item: null }));
        }

        const queue_item = await addKaraokeQueueItem(client, {
          session_id: session.id,
          track_id: requestRow.track_id,
          requested_by: body.requested_by || requestRow.guest_name,
        });
        const request = await setKaraokeGuestRequestStatus(client, { request_id: requestRow.id, status: "queued" });
        if (!request) throw new Error("guest request not found");

        await client.query("COMMIT");
        metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId/guest-requests/:requestId", method: "PATCH", status: "200" });
        return NextResponse.json(UpdateKaraokeGuestRequestResponseSchema.parse({ request, queue_item }));
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const apiErr = classifyApiError(err);
    metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId/guest-requests/:requestId", method: "PATCH", status: String(apiErr.status) });
    return jsonError(apiErr.code, apiErr.message, { status: apiErr.status, details: apiErr.details });
  }
}
