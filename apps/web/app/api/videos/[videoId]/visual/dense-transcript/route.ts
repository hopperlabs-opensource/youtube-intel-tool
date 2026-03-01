import { NextResponse } from "next/server";
import { createJob, getPool, getVideoById, initMetrics } from "@yt/core";
import { getDenseActionCuesByVideo, countDenseActionCues } from "@yt/core";
import {
  BuildDenseTranscriptRequestSchema,
  BuildDenseTranscriptResponseSchema,
  GetDenseTranscriptResponseSchema,
} from "@yt/contracts";
import { jsonError, classifyApiError } from "@/lib/server/api";
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
      const cues = await getDenseActionCuesByVideo(client, videoId);
      const counts = await countDenseActionCues(client, videoId);

      metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/visual/dense-transcript", method: "GET", status: "200" });
      return NextResponse.json(
        GetDenseTranscriptResponseSchema.parse({
          transcript: {
            video_id: videoId,
            cues,
            total_cues: counts.total,
            interpolated_cues: counts.interpolated,
            direct_cues: counts.direct,
          },
        }),
      );
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const apiErr = classifyApiError(err);
    metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/visual/dense-transcript", method: "GET", status: String(apiErr.status) });
    return jsonError(apiErr.code, apiErr.message, { status: apiErr.status, details: apiErr.details });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ videoId: string }> }) {
  const metrics = initMetrics();
  try {
    const { videoId } = await ctx.params;
    const body = BuildDenseTranscriptRequestSchema.parse(await req.json());
    const trace_id = randomUUID();

    const pool = getPool();
    const client = await pool.connect();
    try {
      const video = await getVideoById(client, videoId);
      if (!video) {
        return jsonError("not_found", "video not found", { status: 404 });
      }

      const jobData = { videoId, force: body.force, llmConfig: body.llmConfig, trace_id };
      const job = await createJob(client, {
        type: "build_dense_transcript",
        status: "queued",
        progress: 0,
        input_json: jobData,
      });

      const queue = getIngestQueue();
      await queue.add("build_dense_transcript", jobData, {
        jobId: job.id,
        removeOnComplete: true,
        removeOnFail: false,
      });

      metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/visual/dense-transcript", method: "POST", status: "200" });
      return NextResponse.json(BuildDenseTranscriptResponseSchema.parse({ job }), {
        headers: { "x-trace-id": trace_id },
      });
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const apiErr = classifyApiError(err);
    metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/visual/dense-transcript", method: "POST", status: String(apiErr.status) });
    return jsonError(apiErr.code, apiErr.message, { status: apiErr.status, details: apiErr.details });
  }
}
