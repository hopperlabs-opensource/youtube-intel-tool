import { NextResponse } from "next/server";
import { createJob, getPool, getVideoById, initMetrics } from "@yt/core";
import { IngestVisualRequestSchema, IngestVisualResponseSchema } from "@yt/contracts";
import { jsonError } from "@/lib/server/api";
import { getIngestQueue } from "@/lib/server/queue";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ videoId: string }> }) {
  const metrics = initMetrics();
  try {
    const { videoId } = await ctx.params;
    const body = IngestVisualRequestSchema.parse(await req.json());
    const trace_id = randomUUID();

    const pool = getPool();
    const client = await pool.connect();
    try {
      const video = await getVideoById(client, videoId);
      if (!video) {
        metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/visual/ingest", method: "POST", status: "404" });
        return jsonError("not_found", "video not found", { status: 404 });
      }

      const jobData = {
        videoId,
        extraction: body.extraction,
        vision: body.vision,
        force: body.force,
        trace_id,
      };

      const job = await createJob(client, {
        type: "ingest_visual",
        status: "queued",
        progress: 0,
        input_json: jobData,
      });

      const queue = getIngestQueue();
      await queue.add("ingest_visual", jobData, {
        jobId: job.id,
        removeOnComplete: true,
        removeOnFail: false,
      });

      metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/visual/ingest", method: "POST", status: "200" });
      return NextResponse.json(IngestVisualResponseSchema.parse({ job }), {
        headers: { "x-trace-id": trace_id },
      });
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/visual/ingest", method: "POST", status: "400" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("invalid_request", msg, { status: 400 });
  }
}
