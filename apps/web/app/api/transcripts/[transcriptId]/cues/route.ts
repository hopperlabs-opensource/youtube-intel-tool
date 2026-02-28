import { NextResponse } from "next/server";
import { getPool, initMetrics, listCuesByTranscript } from "@yt/core";
import { ListCuesResponseSchema } from "@yt/contracts";
import { jsonError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ transcriptId: string }> }) {
  const metrics = initMetrics();
  try {
    const { transcriptId } = await ctx.params;
    const url = new URL(req.url);
    const cursor = Number(url.searchParams.get("cursor") || "0");
    const limit = Number(url.searchParams.get("limit") || "5000");

    const pool = getPool();
    const client = await pool.connect();
    try {
      const { cues, next_cursor } = await listCuesByTranscript(client, transcriptId, {
        cursorIdx: cursor,
        limit,
      });
      metrics.httpRequestsTotal.inc({ route: "/api/transcripts/:id/cues", method: "GET", status: "200" });
      return NextResponse.json(ListCuesResponseSchema.parse({ cues, next_cursor }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/transcripts/:id/cues", method: "GET", status: "400" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("invalid_request", msg, { status: 400 });
  }
}
