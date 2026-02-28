import { getEmbeddingsStatus, getPool, initMetrics, listLibraryHealth } from "@yt/core";
import { LibraryHealthResponseSchema } from "@yt/contracts";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/server/api";
import { getEmbeddingsEnvForRequest } from "@/lib/server/openai_key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const metrics = initMetrics();
  try {
    const url = new URL(req.url);
    const limit = url.searchParams.get("limit");
    const offset = url.searchParams.get("offset");

    const embStatus = getEmbeddingsStatus(getEmbeddingsEnvForRequest(req));
    const embeddings_model_id = embStatus.enabled ? embStatus.model_id : null;

    const pool = getPool();
    const client = await pool.connect();
    try {
      const items = await listLibraryHealth(client, {
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
        embeddings_model_id,
      });
      metrics.httpRequestsTotal.inc({ route: "/api/library/health", method: "GET", status: "200" });
      return NextResponse.json(LibraryHealthResponseSchema.parse({ items, embeddings_model_id }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/library/health", method: "GET", status: "400" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("invalid_request", msg, { status: 400 });
  }
}
