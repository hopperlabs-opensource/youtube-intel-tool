import { NextResponse } from "next/server";
import { addKaraokeQueueItem, createKaraokeSession, getKaraokeTrackById, getPool, initMetrics } from "@yt/core";
import { CreateKaraokeSessionRequestSchema, CreateKaraokeSessionResponseSchema } from "@yt/contracts";
import { jsonError, classifyApiError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const metrics = initMetrics();
  try {
    const body = CreateKaraokeSessionRequestSchema.parse(await req.json().catch(() => ({})));

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const session = await createKaraokeSession(client, {
        name: body.name,
        theme_id: body.theme_id,
        host_mode: body.host_mode,
      });

      const queue = [];
      for (const trackId of body.seed_track_ids) {
        const track = await getKaraokeTrackById(client, trackId);
        if (!track) continue;
        const item = await addKaraokeQueueItem(client, {
          session_id: session.id,
          track_id: track.id,
          requested_by: "host",
        });
        queue.push(item);
      }

      await client.query("COMMIT");
      metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions", method: "POST", status: "200" });
      return NextResponse.json(CreateKaraokeSessionResponseSchema.parse({ session, queue }));
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const apiErr = classifyApiError(err);
    metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions", method: "POST", status: String(apiErr.status) });
    return jsonError(apiErr.code, apiErr.message, { status: apiErr.status, details: apiErr.details });
  }
}
