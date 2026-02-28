import { NextResponse } from "next/server";
import { getPool, initMetrics, listVideoSources, upsertVideoSource } from "@yt/core";
import { YouTubeSearchRequestSchema, YouTubeSearchResponseSchema } from "@yt/contracts";
import { jsonError } from "@/lib/server/api";
import { isYtDlpMissingError, runYtDlpJson } from "@/lib/server/yt_dlp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

function asNumber(v: unknown): number | null {
  if (typeof v !== "number") return null;
  if (!Number.isFinite(v)) return null;
  return v;
}

function pickThumbnail(entry: Record<string, unknown>): string | null {
  const direct = asString(entry.thumbnail);
  if (direct) return direct;
  const thumbs = Array.isArray(entry.thumbnails) ? entry.thumbnails : [];
  const best = thumbs
    .map((t) => (t && typeof t === "object" ? (t as Record<string, unknown>) : null))
    .filter(Boolean)
    .map((t) => ({
      url: asString((t as Record<string, unknown>).url),
      width: asNumber((t as Record<string, unknown>).width) ?? 0,
      height: asNumber((t as Record<string, unknown>).height) ?? 0,
    }))
    .filter((t) => Boolean(t.url))
    .sort((a, b) => (b.width || 0) - (a.width || 0));
  return best[0]?.url ?? null;
}

export async function POST(req: Request) {
  const metrics = initMetrics();
  try {
    const body = YouTubeSearchRequestSchema.parse(await req.json().catch(() => ({})));
    const query = body.query.trim();
    const take = body.take;
    const cacheHours = body.cache_hours;
    const refresh = body.refresh;
    const cacheKey = query.toLowerCase();

    const pool = getPool();
    const client = await pool.connect();
    try {
      if (!refresh && cacheHours > 0) {
        const cached = await listVideoSources(client, {
          discovered_via: "ytsearch",
          discovered_key: cacheKey,
          limit: take,
          only_fresh: true,
        });
        if (cached.length) {
          metrics.httpRequestsTotal.inc({ route: "/api/youtube/search", method: "POST", status: "200" });
          return NextResponse.json(YouTubeSearchResponseSchema.parse({ items: cached }));
        }
      }

      // Best-effort discovery with `yt-dlp`. If it's not installed, we return a clear error with install hints.
      let json: unknown;
      try {
        json = await runYtDlpJson(
          ["--dump-single-json", "--no-warnings", "--skip-download", `ytsearch${take}:${query}`],
          { timeoutMs: 90_000 }
        );
      } catch (e: unknown) {
        if (isYtDlpMissingError(e)) {
          return jsonError(
            "missing_dependency",
            "yt-dlp is required for YouTube search. Install it (recommended): `brew install yt-dlp` (or `pipx install yt-dlp`).",
            { status: 400, details: { query } }
          );
        }
        throw e;
      }

      const obj = json && typeof json === "object" ? (json as Record<string, unknown>) : null;
      const entriesRaw = obj && Array.isArray(obj.entries) ? obj.entries : null;
      const entries: Record<string, unknown>[] = (entriesRaw || [])
        .map((e) => (e && typeof e === "object" ? (e as Record<string, unknown>) : null))
        .filter(Boolean) as Record<string, unknown>[];

      const expiresAt =
        cacheHours > 0 ? new Date(Date.now() + Math.floor(cacheHours * 3600 * 1000)) : null;

      const stored = [];
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const id = asString(e.id);
        if (!id) continue;
        const title = asString(e.title);
        const channel_name = asString(e.channel) || asString(e.uploader) || null;
        const thumbnail_url = pickThumbnail(e);
        const duration = asNumber(e.duration);
        const duration_ms = duration != null ? Math.max(0, Math.floor(duration * 1000)) : null;
        const url = `https://www.youtube.com/watch?v=${id}`;

        if (cacheHours > 0) {
          const row = await upsertVideoSource(client, {
            provider: "youtube",
            provider_video_id: id,
            url,
            title: title ?? null,
            channel_name,
            thumbnail_url,
            duration_ms,
            rank: i,
            discovered_via: "ytsearch",
            discovered_key: cacheKey,
            expires_at: expiresAt,
          });
          stored.push(row);
        } else {
          // No cache requested: return an ephemeral row-like shape.
          stored.push({
            id: `ephemeral:${cacheKey}:${id}`,
            provider: "youtube",
            provider_video_id: id,
            url,
            title: title ?? null,
            channel_name,
            thumbnail_url,
            duration_ms,
            rank: i,
            discovered_via: "ytsearch",
            discovered_key: cacheKey,
            fetched_at: new Date().toISOString(),
            expires_at: null,
          });
        }
      }

      metrics.httpRequestsTotal.inc({ route: "/api/youtube/search", method: "POST", status: "200" });
      return NextResponse.json(YouTubeSearchResponseSchema.parse({ items: stored }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/youtube/search", method: "POST", status: "400" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("invalid_request", msg, { status: 400 });
  }
}
