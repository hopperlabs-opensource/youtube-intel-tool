import { NextResponse } from "next/server";
import { getPool, initMetrics, listKaraokeTracks } from "@yt/core";
import { ListKaraokeTracksResponseSchema } from "@yt/contracts";
import { jsonError, classifyApiError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const metrics = initMetrics();
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q") || undefined;
    const language = url.searchParams.get("language") || undefined;
    const ready_state = url.searchParams.get("ready_state") as "pending" | "ready" | "failed" | null;
    const limit = url.searchParams.get("limit");
    const offset = url.searchParams.get("offset");
    const sort = (url.searchParams.get("sort") as "updated_desc" | "title_asc" | null) ?? undefined;

    const pool = getPool();
    const client = await pool.connect();
    try {
      const tracks = await listKaraokeTracks(client, {
        q,
        language,
        ready_state: ready_state || undefined,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
        sort,
      });
      metrics.httpRequestsTotal.inc({ route: "/api/karaoke/tracks", method: "GET", status: "200" });
      return NextResponse.json(ListKaraokeTracksResponseSchema.parse({ tracks }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const apiErr = classifyApiError(err);
    metrics.httpRequestsTotal.inc({ route: "/api/karaoke/tracks", method: "GET", status: String(apiErr.status) });
    return jsonError(apiErr.code, apiErr.message, { status: apiErr.status, details: apiErr.details });
  }
}
