import { NextResponse } from "next/server";
import { getPool, initMetrics, listLibraryTopics } from "@yt/core";
import { ListLibraryTopicsResponseSchema } from "@yt/contracts";
import { jsonError, classifyApiError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const metrics = initMetrics();
  try {
    const url = new URL(req.url);
    const limit = url.searchParams.get("limit");
    const offset = url.searchParams.get("offset");

    const pool = getPool();
    const client = await pool.connect();
    try {
      const topics = await listLibraryTopics(client, {
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      });
      metrics.httpRequestsTotal.inc({ route: "/api/library/topics", method: "GET", status: "200" });
      return NextResponse.json(ListLibraryTopicsResponseSchema.parse({ topics }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const apiErr = classifyApiError(err);
    metrics.httpRequestsTotal.inc({ route: "/api/library/topics", method: "GET", status: String(apiErr.status) });
    return jsonError(apiErr.code, apiErr.message, { status: apiErr.status, details: apiErr.details });
  }
}

