import { NextResponse } from "next/server";
import { fetchYouTubeOEmbed, getPool, parseYouTubeUrl, updateVideoMetadata, upsertVideoByProviderId, initMetrics } from "@yt/core";
import { ResolveVideoRequestSchema, ResolveVideoResponseSchema } from "@yt/contracts";
import { jsonError, classifyApiError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const metrics = initMetrics();
  try {
    const body = ResolveVideoRequestSchema.parse(await req.json());
    const parsed = parseYouTubeUrl(body.url);

    const pool = getPool();
    const client = await pool.connect();
    try {
      let video = await upsertVideoByProviderId(client, {
        provider: "youtube",
        provider_video_id: parsed.provider_video_id,
        url: body.url,
      });

      // Best-effort metadata enrichment for nicer library UI.
      const meta = await fetchYouTubeOEmbed({ url: video.url, timeoutMs: 1500 });
      if (meta) {
        video = await updateVideoMetadata(client, video.id, {
          title: meta.title,
          channel_name: meta.author_name ?? null,
          thumbnail_url: meta.thumbnail_url ?? null,
        });
      }
      metrics.httpRequestsTotal.inc({ route: "/api/videos/resolve", method: "POST", status: "200" });
      return NextResponse.json(ResolveVideoResponseSchema.parse({ video }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const apiErr = classifyApiError(err);
    metrics.httpRequestsTotal.inc({ route: "/api/videos/resolve", method: "POST", status: String(apiErr.status) });
    return jsonError(apiErr.code, apiErr.message, { status: apiErr.status, details: apiErr.details });
  }
}
