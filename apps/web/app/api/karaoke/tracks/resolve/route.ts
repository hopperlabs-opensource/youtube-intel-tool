import { NextResponse } from "next/server";
import {
  createJob,
  fetchYouTubeOEmbed,
  getPool,
  initMetrics,
  parseYouTubeUrl,
  syncKaraokeTrackForVideo,
  updateVideoMetadata,
  upsertVideoByProviderId,
} from "@yt/core";
import { KaraokeResolveTrackRequestSchema, KaraokeResolveTrackResponseSchema } from "@yt/contracts";
import { jsonError, classifyApiError } from "@/lib/server/api";
import { getIngestQueue } from "@/lib/server/queue";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const metrics = initMetrics();
  try {
    const body = KaraokeResolveTrackRequestSchema.parse(await req.json().catch(() => ({})));
    const parsed = parseYouTubeUrl(body.url);
    const url = `https://www.youtube.com/watch?v=${parsed.provider_video_id}`;
    const trace_id = randomUUID();

    const pool = getPool();
    const client = await pool.connect();
    try {
      const video = await upsertVideoByProviderId(client, {
        provider: "youtube",
        provider_video_id: parsed.provider_video_id,
        url,
      });

      const meta = await fetchYouTubeOEmbed({ url, timeoutMs: 1500 });
      const hydratedVideo =
        meta && (meta.title || meta.author_name || meta.thumbnail_url)
          ? await updateVideoMetadata(client, video.id, {
              title: meta.title || null,
              channel_name: meta.author_name || null,
              thumbnail_url: meta.thumbnail_url || null,
            })
          : video;

      const track = await syncKaraokeTrackForVideo(client, {
        video_id: hydratedVideo.id,
        provider_video_id: hydratedVideo.provider_video_id,
        title: hydratedVideo.title,
        channel_name: hydratedVideo.channel_name,
        thumbnail_url: hydratedVideo.thumbnail_url,
        duration_ms: hydratedVideo.duration_ms,
        language: body.language,
      });

      let ingestJob = null;
      if (track.ready_state !== "ready") {
        ingestJob = await createJob(client, {
          type: "ingest_video",
          status: "queued",
          progress: 0,
          input_json: { videoId: hydratedVideo.id, language: body.language, trace_id, steps: ["enrich_cli"] },
        });
        const queue = getIngestQueue();
        await queue.add(
          "ingest_video",
          { videoId: hydratedVideo.id, language: body.language, trace_id, steps: ["enrich_cli"] },
          { jobId: ingestJob.id, removeOnComplete: true, removeOnFail: false }
        );
      }

      metrics.httpRequestsTotal.inc({ route: "/api/karaoke/tracks/resolve", method: "POST", status: "200" });
      return NextResponse.json(
        KaraokeResolveTrackResponseSchema.parse({ track, video: hydratedVideo, ingest_job: ingestJob }),
        { headers: { "x-trace-id": trace_id } }
      );
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const apiErr = classifyApiError(err);
    metrics.httpRequestsTotal.inc({ route: "/api/karaoke/tracks/resolve", method: "POST", status: String(apiErr.status) });
    return jsonError(apiErr.code, apiErr.message, { status: apiErr.status, details: apiErr.details });
  }
}
