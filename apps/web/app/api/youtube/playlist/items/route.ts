import { NextResponse } from "next/server";
import { assertYouTubeUrl, getPool, initMetrics, listVideoSources, upsertVideoSource } from "@yt/core";
import { YouTubePlaylistItemsRequestSchema, YouTubePlaylistItemsResponseSchema } from "@yt/contracts";
import { jsonError } from "@/lib/server/api";
import { isYtDlpMissingError, runYtDlpJson } from "@/lib/server/yt_dlp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

export async function POST(req: Request) {
  const metrics = initMetrics();
  try {
    const body = YouTubePlaylistItemsRequestSchema.parse(await req.json().catch(() => ({})));
    const parsedUrl = assertYouTubeUrl(body.url.trim());
    const listId = String(parsedUrl.searchParams.get("list") || "").trim();
    if (!listId) throw new Error("url must be a YouTube playlist URL with a 'list' parameter");
    const url = `https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}`;
    const take = body.take;
    const cacheHours = body.cache_hours;
    const refresh = body.refresh;
    const key = `playlist:${listId.toLowerCase()}`;

    const pool = getPool();
    const client = await pool.connect();
    try {
      if (!refresh && cacheHours > 0) {
        const cached = await listVideoSources(client, {
          discovered_via: "playlist",
          discovered_key: key,
          limit: take,
          only_fresh: true,
        });
        if (cached.length) {
          metrics.httpRequestsTotal.inc({ route: "/api/youtube/playlist/items", method: "POST", status: "200" });
          return NextResponse.json(YouTubePlaylistItemsResponseSchema.parse({ items: cached }));
        }
      }

      let json: unknown;
      try {
        json = await runYtDlpJson(["--dump-single-json", "--no-warnings", "--skip-download", "--flat-playlist", url], {
          timeoutMs: 60_000,
        });
      } catch (e: unknown) {
        if (isYtDlpMissingError(e)) {
          return jsonError(
            "missing_dependency",
            "yt-dlp is required for playlist discovery. Install it (recommended): `brew install yt-dlp` (or `pipx install yt-dlp`).",
            { status: 400, details: { url } }
          );
        }
        throw e;
      }

      const obj = json && typeof json === "object" ? (json as Record<string, unknown>) : null;
      const entriesRaw = obj && Array.isArray(obj.entries) ? obj.entries : null;
      const entries: Record<string, unknown>[] = (entriesRaw || [])
        .map((e) => (e && typeof e === "object" ? (e as Record<string, unknown>) : null))
        .filter(Boolean) as Record<string, unknown>[];

      const playlistTitle = obj ? asString(obj.title) : null;
      const expiresAt = cacheHours > 0 ? new Date(Date.now() + Math.floor(cacheHours * 3600 * 1000)) : null;

      const stored = [];
      for (let i = 0; i < Math.min(take, entries.length); i++) {
        const e = entries[i];
        const id = asString(e.id);
        if (!id) continue;
        const title = asString(e.title);
        const url = `https://www.youtube.com/watch?v=${id}`;

        const row = await upsertVideoSource(client, {
          provider: "youtube",
          provider_video_id: id,
          url,
          title: title ?? null,
          channel_name: asString(e.channel) || asString(e.uploader) || playlistTitle,
          thumbnail_url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
          duration_ms: null,
          rank: i,
          discovered_via: "playlist",
          discovered_key: key,
          expires_at: expiresAt,
        });
        stored.push(row);
      }

      metrics.httpRequestsTotal.inc({ route: "/api/youtube/playlist/items", method: "POST", status: "200" });
      return NextResponse.json(YouTubePlaylistItemsResponseSchema.parse({ items: stored }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/youtube/playlist/items", method: "POST", status: "400" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("invalid_request", msg, { status: 400 });
  }
}
