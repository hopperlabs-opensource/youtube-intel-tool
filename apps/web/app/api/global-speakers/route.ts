import { NextResponse } from "next/server";
import { getPool, initMetrics } from "@yt/core";
import { listGlobalSpeakers, upsertGlobalSpeaker, linkSpeakerToGlobal, getSpeakerEmbedding } from "@yt/core";
import {
  ListGlobalSpeakersResponseSchema,
  CreateGlobalSpeakerRequestSchema,
  CreateGlobalSpeakerResponseSchema,
} from "@yt/contracts";
import { jsonError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request) {
  const metrics = initMetrics();
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const global_speakers = await listGlobalSpeakers(client);
      metrics.httpRequestsTotal.inc({ route: "/api/global-speakers", method: "GET", status: "200" });
      return NextResponse.json(ListGlobalSpeakersResponseSchema.parse({ global_speakers }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/global-speakers", method: "GET", status: "500" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("internal_error", msg, { status: 500 });
  }
}

export async function POST(req: Request) {
  const metrics = initMetrics();
  try {
    const body = CreateGlobalSpeakerRequestSchema.parse(await req.json());
    const pool = getPool();
    const client = await pool.connect();
    try {
      const global_speaker = await upsertGlobalSpeaker(client, { display_name: body.display_name });
      const link = await linkSpeakerToGlobal(client, {
        global_speaker_id: global_speaker.id,
        speaker_id: body.speaker_id,
        source: "manual",
      });
      metrics.httpRequestsTotal.inc({ route: "/api/global-speakers", method: "POST", status: "200" });
      return NextResponse.json(CreateGlobalSpeakerResponseSchema.parse({ global_speaker, link }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/global-speakers", method: "POST", status: "400" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("invalid_request", msg, { status: 400 });
  }
}
