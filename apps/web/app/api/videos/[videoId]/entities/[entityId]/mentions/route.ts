import { NextResponse } from "next/server";
import { getPool, initMetrics, listMentionsForEntity } from "@yt/core";
import { ListEntityMentionsResponseSchema } from "@yt/contracts";
import { jsonError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ videoId: string; entityId: string }> }) {
  const metrics = initMetrics();
  try {
    const { entityId } = await ctx.params;
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") || "500");

    const pool = getPool();
    const client = await pool.connect();
    try {
      const mentions = await listMentionsForEntity(client, entityId, { limit });
      metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/entities/:entityId/mentions", method: "GET", status: "200" });
      return NextResponse.json(ListEntityMentionsResponseSchema.parse({ mentions }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/entities/:entityId/mentions", method: "GET", status: "400" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("invalid_request", msg, { status: 400 });
  }
}
