import { NextResponse } from "next/server";
import { createJob, getPool, initMetrics } from "@yt/core";
import { LibraryRepairRequestSchema, LibraryRepairResponseSchema } from "@yt/contracts";
import { jsonError, classifyApiError } from "@/lib/server/api";
import { getIngestQueue } from "@/lib/server/queue";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const metrics = initMetrics();
  try {
    const body = LibraryRepairRequestSchema.parse(await req.json().catch(() => ({})));
    const videoIds = Array.from(new Set(body.video_ids));
    if (videoIds.length === 0) return jsonError("invalid_request", "video_ids is empty", { status: 400 });

    const pool = getPool();
    const client = await pool.connect();
    try {
      const queue = getIngestQueue();
      const jobs = [];

      for (const videoId of videoIds) {
        const trace_id = randomUUID();
        const steps = body.steps ?? null;

        const job = await createJob(client, {
          type: "ingest_video",
          status: "queued",
          progress: 0,
          input_json: { videoId, language: body.language, trace_id, steps },
        });

        await queue.add(
          "ingest_video",
          { videoId, language: body.language, trace_id, steps },
          { jobId: job.id, removeOnComplete: true, removeOnFail: false }
        );

        jobs.push(job);
      }

      metrics.httpRequestsTotal.inc({ route: "/api/library/repair", method: "POST", status: "200" });
      return NextResponse.json(LibraryRepairResponseSchema.parse({ jobs }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const apiErr = classifyApiError(err);
    metrics.httpRequestsTotal.inc({ route: "/api/library/repair", method: "POST", status: String(apiErr.status) });
    return jsonError(apiErr.code, apiErr.message, { status: apiErr.status, details: apiErr.details });
  }
}

