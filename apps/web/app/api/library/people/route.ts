import { NextResponse } from "next/server";
import { getPool, initMetrics, listLibraryPeople } from "@yt/core";
import { ListLibraryPeopleResponseSchema } from "@yt/contracts";
import { jsonError } from "@/lib/server/api";

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
      const people = await listLibraryPeople(client, {
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      });
      metrics.httpRequestsTotal.inc({ route: "/api/library/people", method: "GET", status: "200" });
      return NextResponse.json(ListLibraryPeopleResponseSchema.parse({ people }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/library/people", method: "GET", status: "400" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("invalid_request", msg, { status: 400 });
  }
}

