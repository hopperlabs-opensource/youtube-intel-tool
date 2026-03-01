import { NextResponse } from "next/server";
import { createSavedPolicy, getPool, initMetrics, listSavedPolicies } from "@yt/core";
import {
  CreatePolicyRequestSchema,
  CreatePolicyResponseSchema,
  ListPoliciesResponseSchema,
} from "@yt/contracts";
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
      const policies = await listSavedPolicies(client, {
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      });
      metrics.httpRequestsTotal.inc({ route: "/api/policies", method: "GET", status: "200" });
      return NextResponse.json(ListPoliciesResponseSchema.parse({ policies }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/policies", method: "GET", status: "400" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("invalid_request", msg, { status: 400 });
  }
}

export async function POST(req: Request) {
  const metrics = initMetrics();
  try {
    const body = CreatePolicyRequestSchema.parse(await req.json().catch(() => ({})));
    const pool = getPool();
    const client = await pool.connect();
    try {
      const policy = await createSavedPolicy(client, {
        name: body.name,
        description: body.description ?? null,
        enabled: body.enabled,
        search_payload: body.search_payload,
        priority_config: body.priority_config,
      });
      metrics.httpRequestsTotal.inc({ route: "/api/policies", method: "POST", status: "200" });
      return NextResponse.json(CreatePolicyResponseSchema.parse({ policy }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/policies", method: "POST", status: "400" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("invalid_request", msg, { status: 400 });
  }
}
