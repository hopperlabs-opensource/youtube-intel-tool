import { NextResponse } from "next/server";
import {
  createKaraokeGuestToken,
  getKaraokeSessionById,
  getPool,
  initMetrics,
} from "@yt/core";
import { CreateKaraokeGuestTokenRequestSchema, CreateKaraokeGuestTokenResponseSchema } from "@yt/contracts";
import { karaokeJoinPath } from "@yt/experience-core";
import { jsonError, classifyApiError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  const metrics = initMetrics();
  try {
    const { sessionId } = await ctx.params;
    const body = CreateKaraokeGuestTokenRequestSchema.parse(await req.json().catch(() => ({})));

    const pool = getPool();
    const client = await pool.connect();
    try {
      const session = await getKaraokeSessionById(client, sessionId);
      if (!session) {
        metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId/guest-token", method: "POST", status: "404" });
        return jsonError("not_found", "session not found", { status: 404 });
      }
      const out = await createKaraokeGuestToken(client, {
        session_id: session.id,
        ttl_minutes: body.ttl_minutes,
      });
      const join_path = karaokeJoinPath(out.token);
      metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId/guest-token", method: "POST", status: "200" });
      return NextResponse.json(
        CreateKaraokeGuestTokenResponseSchema.parse({ token: out.token, expires_at: out.expires_at, join_path })
      );
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const apiErr = classifyApiError(err);
    metrics.httpRequestsTotal.inc({ route: "/api/karaoke/sessions/:sessionId/guest-token", method: "POST", status: String(apiErr.status) });
    return jsonError(apiErr.code, apiErr.message, { status: apiErr.status, details: apiErr.details });
  }
}
