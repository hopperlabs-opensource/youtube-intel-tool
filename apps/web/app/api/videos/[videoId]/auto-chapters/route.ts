import { NextResponse } from "next/server";
import { createJob, getPool, getVideoById, initMetrics } from "@yt/core";
import { listAutoChapters, listSignificantMarks } from "@yt/core";
import {
  DetectAutoChaptersRequestSchema,
  DetectAutoChaptersResponseSchema,
  GetAutoChaptersResponseSchema,
} from "@yt/contracts";
import { jsonError } from "@/lib/server/api";
import { getIngestQueue } from "@/lib/server/queue";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ videoId: string }> }) {
  const metrics = initMetrics();
  try {
    const { videoId } = await ctx.params;
    const pool = getPool();
    const client = await pool.connect();
    try {
      const chapters = await listAutoChapters(client, videoId);
      const marks = await listSignificantMarks(client, videoId);

      metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/auto-chapters", method: "GET", status: "200" });
      return NextResponse.json(
        GetAutoChaptersResponseSchema.parse({ chapters, marks }),
      );
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/auto-chapters", method: "GET", status: "500" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("internal_error", msg, { status: 500 });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ videoId: string }> }) {
  const metrics = initMetrics();
  try {
    const { videoId } = await ctx.params;
    const body = DetectAutoChaptersRequestSchema.parse(await req.json());
    const trace_id = randomUUID();

    const pool = getPool();
    const client = await pool.connect();
    try {
      const video = await getVideoById(client, videoId);
      if (!video) {
        return jsonError("not_found", "video not found", { status: 404 });
      }

      const jobData = {
        videoId,
        force: body.force,
        min_signals: body.min_signals,
        window_ms: body.window_ms,
        llmConfig: body.llmConfig,
        trace_id,
      };
      const job = await createJob(client, {
        type: "detect_chapters",
        status: "queued",
        progress: 0,
        input_json: jobData,
      });

      const queue = getIngestQueue();
      await queue.add("detect_chapters", jobData, {
        jobId: job.id,
        removeOnComplete: true,
        removeOnFail: false,
      });

      metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/auto-chapters", method: "POST", status: "200" });
      return NextResponse.json(DetectAutoChaptersResponseSchema.parse({ job }), {
        headers: { "x-trace-id": trace_id },
      });
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/auto-chapters", method: "POST", status: "400" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("invalid_request", msg, { status: 400 });
  }
}
