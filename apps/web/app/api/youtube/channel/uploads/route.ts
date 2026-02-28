import { NextResponse } from "next/server";
import { assertYouTubeUrl, getPool, initMetrics, listVideoSources, upsertVideoSource } from "@yt/core";
import { YouTubeChannelUploadsRequestSchema, YouTubeChannelUploadsResponseSchema } from "@yt/contracts";
import { jsonError } from "@/lib/server/api";
import { isYtDlpMissingError, runYtDlpJson } from "@/lib/server/yt_dlp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

function normalizeChannelUrl(handleOrUrl: string): { url: string; key: string } {
  const raw = handleOrUrl.trim();
  if (!raw) throw new Error("handle_or_url is empty");

  // @handle -> https://www.youtube.com/@handle/videos
  if (raw.startsWith("@")) {
    const handle = raw.replace(/\s+/g, "");
    return { url: `https://www.youtube.com/${handle}/videos`, key: `handle:${handle.toLowerCase()}` };
  }

  // UC... channel id
  if (/^UC[a-zA-Z0-9_-]{10,}$/.test(raw)) {
    return { url: `https://www.youtube.com/channel/${raw}/videos`, key: `channel:${raw}` };
  }

  // URL
  if (/^https?:\/\//i.test(raw)) {
    const u = assertYouTubeUrl(raw);
    const parts = u.pathname.split("/").filter(Boolean);
    if (!parts.length) throw new Error("handle_or_url must be a YouTube channel URL or handle");

    // Canonicalize supported channel URL shapes into a /videos endpoint.
    let canonical: string | null = null;
    if (parts[0].startsWith("@")) {
      canonical = `https://www.youtube.com/${parts[0]}/videos`;
    } else if (parts[0] === "channel" && parts[1]) {
      canonical = `https://www.youtube.com/channel/${parts[1]}/videos`;
    } else if (parts[0] === "c" && parts[1]) {
      canonical = `https://www.youtube.com/c/${parts[1]}/videos`;
    } else if (parts[0] === "user" && parts[1]) {
      canonical = `https://www.youtube.com/user/${parts[1]}/videos`;
    }
    if (!canonical) throw new Error("handle_or_url must be a YouTube channel URL or handle");
    return { url: canonical, key: `url:${canonical.toLowerCase()}` };
  }

  // Best-effort: treat as a handle without '@'.
  const handle = `@${raw.replace(/\s+/g, "")}`;
  return { url: `https://www.youtube.com/${handle}/videos`, key: `handle:${handle.toLowerCase()}` };
}

export async function POST(req: Request) {
  const metrics = initMetrics();
  try {
    const body = YouTubeChannelUploadsRequestSchema.parse(await req.json().catch(() => ({})));
    const { url, key } = normalizeChannelUrl(body.handle_or_url);
    const take = body.take;
    const cacheHours = body.cache_hours;
    const refresh = body.refresh;

    const pool = getPool();
    const client = await pool.connect();
    try {
      if (!refresh && cacheHours > 0) {
        const cached = await listVideoSources(client, {
          discovered_via: "channel_uploads",
          discovered_key: key,
          limit: take,
          only_fresh: true,
        });
        if (cached.length) {
          metrics.httpRequestsTotal.inc({ route: "/api/youtube/channel/uploads", method: "POST", status: "200" });
          return NextResponse.json(YouTubeChannelUploadsResponseSchema.parse({ items: cached }));
        }
      }

      let json: unknown;
      try {
        json = await runYtDlpJson(["--dump-single-json", "--no-warnings", "--skip-download", "--flat-playlist", url], {
          timeoutMs: 45_000,
        });
      } catch (e: unknown) {
        if (isYtDlpMissingError(e)) {
          return jsonError(
            "missing_dependency",
            "yt-dlp is required for channel discovery. Install it (recommended): `brew install yt-dlp` (or `pipx install yt-dlp`).",
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

      const channelName = (obj ? asString(obj.uploader) || asString(obj.channel) || asString(obj.title) : null) ?? null;
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
          channel_name: asString(e.channel) || asString(e.uploader) || channelName,
          thumbnail_url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
          duration_ms: null,
          rank: i,
          discovered_via: "channel_uploads",
          discovered_key: key,
          expires_at: expiresAt,
        });
        stored.push(row);
      }

      metrics.httpRequestsTotal.inc({ route: "/api/youtube/channel/uploads", method: "POST", status: "200" });
      return NextResponse.json(YouTubeChannelUploadsResponseSchema.parse({ items: stored }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/youtube/channel/uploads", method: "POST", status: "400" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("invalid_request", msg, { status: 400 });
  }
}
