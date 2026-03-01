import { NextResponse } from "next/server";
import { getPool, initMetrics } from "@yt/core";
import { getGlobalSpeaker, getGlobalSpeakerLinks, updateGlobalSpeakerDisplayName } from "@yt/core";
import {
  GetGlobalSpeakerResponseSchema,
  UpdateGlobalSpeakerRequestSchema,
  UpdateGlobalSpeakerResponseSchema,
} from "@yt/contracts";
import { jsonError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const metrics = initMetrics();
  try {
    const { id } = await ctx.params;
    const pool = getPool();
    const client = await pool.connect();
    try {
      const global_speaker = await getGlobalSpeaker(client, id);
      if (!global_speaker) {
        return jsonError("not_found", "Global speaker not found", { status: 404 });
      }
      const links = await getGlobalSpeakerLinks(client, id);
      metrics.httpRequestsTotal.inc({ route: "/api/global-speakers/:id", method: "GET", status: "200" });
      return NextResponse.json(GetGlobalSpeakerResponseSchema.parse({ global_speaker, links }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/global-speakers/:id", method: "GET", status: "500" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("internal_error", msg, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const metrics = initMetrics();
  try {
    const { id } = await ctx.params;
    const body = UpdateGlobalSpeakerRequestSchema.parse(await req.json());
    const pool = getPool();
    const client = await pool.connect();
    try {
      const global_speaker = body.display_name
        ? await updateGlobalSpeakerDisplayName(client, id, body.display_name)
        : await getGlobalSpeaker(client, id);
      if (!global_speaker) {
        return jsonError("not_found", "Global speaker not found", { status: 404 });
      }
      metrics.httpRequestsTotal.inc({ route: "/api/global-speakers/:id", method: "PATCH", status: "200" });
      return NextResponse.json(UpdateGlobalSpeakerResponseSchema.parse({ global_speaker }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/global-speakers/:id", method: "PATCH", status: "400" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("invalid_request", msg, { status: 400 });
  }
}
