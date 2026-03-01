import { NextResponse } from "next/server";
import {
  createKaraokeGuestRequest,
  getKaraokeTrackById,
  getPool,
  initMetrics,
  resolveKaraokeGuestToken,
} from "@yt/core";
import { CreateKaraokeGuestRequestRequestSchema, CreateKaraokeGuestRequestResponseSchema } from "@yt/contracts";
import { jsonError, classifyApiError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const metrics = initMetrics();
  try {
    const { token } = await ctx.params;
    const body = CreateKaraokeGuestRequestRequestSchema.parse(await req.json().catch(() => ({})));

    const pool = getPool();
    const client = await pool.connect();
    try {
      const resolved = await resolveKaraokeGuestToken(client, token);
      if (!resolved) {
        metrics.httpRequestsTotal.inc({ route: "/api/karaoke/join/:token/requests", method: "POST", status: "404" });
        return jsonError("not_found", "invalid or expired join token", { status: 404 });
      }

      const track = await getKaraokeTrackById(client, body.track_id);
      if (!track) {
        metrics.httpRequestsTotal.inc({ route: "/api/karaoke/join/:token/requests", method: "POST", status: "404" });
        return jsonError("not_found", "track not found", { status: 404 });
      }

      const request = await createKaraokeGuestRequest(client, {
        session_id: resolved.session_id,
        track_id: track.id,
        guest_name: body.guest_name,
      });

      metrics.httpRequestsTotal.inc({ route: "/api/karaoke/join/:token/requests", method: "POST", status: "200" });
      return NextResponse.json(CreateKaraokeGuestRequestResponseSchema.parse({ request }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const apiErr = classifyApiError(err);
    metrics.httpRequestsTotal.inc({ route: "/api/karaoke/join/:token/requests", method: "POST", status: String(apiErr.status) });
    return jsonError(apiErr.code, apiErr.message, { status: apiErr.status, details: apiErr.details });
  }
}
