import { NextResponse } from "next/server";
import { getChatTurnById, getPool, initMetrics } from "@yt/core";
import { GetChatTurnResponseSchema } from "@yt/contracts";
import { jsonError, classifyApiError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ turnId: string }> }) {
  const metrics = initMetrics();
  try {
    const { turnId } = await ctx.params;
    const pool = getPool();
    const client = await pool.connect();
    try {
      const turn = await getChatTurnById(client, turnId);
      if (!turn) {
        metrics.httpRequestsTotal.inc({ route: "/api/chat/turns/:id", method: "GET", status: "404" });
        return jsonError("not_found", "chat turn not found", { status: 404 });
      }
      metrics.httpRequestsTotal.inc({ route: "/api/chat/turns/:id", method: "GET", status: "200" });
      return NextResponse.json(GetChatTurnResponseSchema.parse({ turn }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const apiErr = classifyApiError(err);
    metrics.httpRequestsTotal.inc({ route: "/api/chat/turns/:id", method: "GET", status: String(apiErr.status) });
    return jsonError(apiErr.code, apiErr.message, { status: apiErr.status, details: apiErr.details });
  }
}
