import { NextResponse } from "next/server";
import { createJob, getPool, getVideoById, initMetrics } from "@yt/core";
import { IngestFacesResponseSchema } from "@yt/contracts";
import { jsonError, classifyApiError } from "@/lib/server/api";
import { getIngestQueue } from "@/lib/server/queue";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ videoId: string }> }) {
  const metrics = initMetrics();
  try {
    const { videoId } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const trace_id = randomUUID();

    const pool = getPool();
    const client = await pool.connect();
    try {
      const video = await getVideoById(client, videoId);
      if (!video) {
        metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/faces/ingest", method: "POST", status: "404" });
        return jsonError("not_found", "video not found", { status: 404 });
      }

      const jobData = {
        videoId,
        det_threshold: body.det_threshold,
        cluster_threshold: body.cluster_threshold,
        force: body.force,
        trace_id,
      };

      const job = await createJob(client, {
        type: "ingest_faces",
        status: "queued",
        progress: 0,
        input_json: jobData,
      });

      const queue = getIngestQueue();
      await queue.add("ingest_faces", jobData, {
        jobId: job.id,
        removeOnComplete: true,
        removeOnFail: false,
      });

      metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/faces/ingest", method: "POST", status: "200" });
      return NextResponse.json(IngestFacesResponseSchema.parse({ job }), {
        headers: { "x-trace-id": trace_id },
      });
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const apiErr = classifyApiError(err);
    metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/faces/ingest", method: "POST", status: String(apiErr.status) });
    return jsonError(apiErr.code, apiErr.message, { status: apiErr.status, details: apiErr.details });
  }
}
