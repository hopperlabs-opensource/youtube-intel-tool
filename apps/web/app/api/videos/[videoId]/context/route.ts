import { NextResponse } from "next/server";
import { getPool, initMetrics, listContextItemsForEntities, listEntitiesForVideoInWindow } from "@yt/core";
import { GetContextResponseSchema } from "@yt/contracts";
import { jsonError, classifyApiError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ videoId: string }> }) {
  const metrics = initMetrics();
  try {
    const { videoId } = await ctx.params;
    const url = new URL(req.url);
    const at_ms = url.searchParams.get("at_ms");
    const window_ms = url.searchParams.get("window_ms");

    const pool = getPool();
    const client = await pool.connect();
    try {
      const entities = await listEntitiesForVideoInWindow(client, videoId, {
        at_ms: at_ms ? Number(at_ms) : undefined,
        window_ms: window_ms ? Number(window_ms) : undefined,
        limit: 20,
      });
      const itemsByEntityId = await listContextItemsForEntities(
        client,
        entities.map((e) => e.id),
        { limitPerEntity: 3 }
      );
      const cards = entities.map((entity) => ({ entity, items: itemsByEntityId[entity.id] || [] }));
      metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/context", method: "GET", status: "200" });
      return NextResponse.json(GetContextResponseSchema.parse({ cards }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const apiErr = classifyApiError(err);
    metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/context", method: "GET", status: String(apiErr.status) });
    return jsonError(apiErr.code, apiErr.message, { status: apiErr.status, details: apiErr.details });
  }
}
