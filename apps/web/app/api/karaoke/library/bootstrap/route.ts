import { NextResponse } from "next/server";
import {
  addKaraokePlaylistItem,
  createKaraokePlaylist,
  getPool,
  initMetrics,
  listKaraokePlaylistItems,
  listKaraokePlaylists,
  syncKaraokeTrackForVideo,
  updateVideoMetadata,
  upsertVideoByProviderId,
} from "@yt/core";
import { z } from "zod";
import { jsonError, classifyApiError } from "@/lib/server/api";
import { isYtDlpMissingError, runYtDlpJson } from "@/lib/server/yt_dlp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BootstrapKaraokeLibraryRequestSchema = z.object({
  target_count: z.number().int().min(50).max(2000).default(1000),
  language: z.string().trim().min(2).max(12).default("en"),
  query_pack: z.enum(["default", "quick"]).default("default"),
});

type KaraokeSeedCandidate = {
  provider_video_id: string;
  title: string | null;
  channel_name: string | null;
  thumbnail_url: string | null;
  duration_ms: number | null;
};

const DEFAULT_SEARCH_QUERIES = [
  "karaoke classics official",
  "karaoke 80s hits",
  "karaoke 90s hits",
  "karaoke 2000s pop",
  "karaoke 2010s pop",
  "karaoke rock anthems",
  "karaoke rnb hits",
  "karaoke latin hits",
  "karaoke country hits",
  "karaoke duets",
  "karaoke disney songs",
  "karaoke party songs",
];

const QUICK_SEARCH_QUERIES = [
  "karaoke party songs",
  "karaoke classics",
  "karaoke duets",
  "karaoke pop hits",
];

function asString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed ? trimmed : null;
}

function asDurationMs(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : Number.NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n * 1000);
}

function extractCandidates(json: unknown): KaraokeSeedCandidate[] {
  if (!json || typeof json !== "object") return [];
  const obj = json as Record<string, unknown>;
  if (!Array.isArray(obj.entries)) return [];
  const entries = obj.entries;
  const out: KaraokeSeedCandidate[] = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const id = asString(e.id);
    if (!id) continue;
    out.push({
      provider_video_id: id,
      title: asString(e.title),
      channel_name: asString(e.channel) || asString(e.uploader) || asString(e.channel_id),
      thumbnail_url: asString(e.thumbnail) || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      duration_ms: asDurationMs(e.duration),
    });
  }

  return out;
}

async function discoverSeedCandidates(targetCount: number, queryPack: "default" | "quick"): Promise<KaraokeSeedCandidate[]> {
  const queries = queryPack === "quick" ? QUICK_SEARCH_QUERIES : DEFAULT_SEARCH_QUERIES;
  const perQuery = Math.max(40, Math.min(250, Math.ceil((targetCount * 1.8) / queries.length)));
  const deduped = new Map<string, KaraokeSeedCandidate>();

  for (const q of queries) {
    if (deduped.size >= Math.ceil(targetCount * 1.2)) break;
    const json = await runYtDlpJson(
      ["--dump-single-json", "--no-warnings", "--skip-download", "--flat-playlist", `ytsearch${perQuery}:${q}`],
      { timeoutMs: 120_000 }
    );
    const candidates = extractCandidates(json);
    for (const c of candidates) {
      if (!deduped.has(c.provider_video_id)) {
        deduped.set(c.provider_video_id, c);
      }
    }
  }

  return [...deduped.values()].slice(0, targetCount);
}

export async function POST(req: Request) {
  const metrics = initMetrics();
  try {
    const body = BootstrapKaraokeLibraryRequestSchema.parse(await req.json().catch(() => ({})));

    let candidates: KaraokeSeedCandidate[] = [];
    try {
      candidates = await discoverSeedCandidates(body.target_count, body.query_pack);
    } catch (err: unknown) {
      if (isYtDlpMissingError(err)) {
        return jsonError(
          "missing_dependency",
          "yt-dlp is required to bootstrap the karaoke library. Install it with: `brew install yt-dlp`.",
          { status: 400 }
        );
      }
      throw err;
    }

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const trackIds: string[] = [];
      for (const candidate of candidates) {
        const watchUrl = `https://www.youtube.com/watch?v=${candidate.provider_video_id}`;
        const video = await upsertVideoByProviderId(client, {
          provider: "youtube",
          provider_video_id: candidate.provider_video_id,
          url: watchUrl,
        });
        const hydratedVideo =
          candidate.title || candidate.channel_name || candidate.thumbnail_url || candidate.duration_ms
            ? await updateVideoMetadata(client, video.id, {
                title: candidate.title,
                channel_name: candidate.channel_name,
                thumbnail_url: candidate.thumbnail_url,
                duration_ms: candidate.duration_ms,
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
        trackIds.push(track.id);
      }

      const existingPlaylists = await listKaraokePlaylists(client, { limit: 200, offset: 0 });
      const byName = new Map(existingPlaylists.map((p) => [p.name.trim().toLowerCase(), p]));
      const plans = [
        { name: "Party Starters", description: "High-energy openers for quick momentum.", sliceFrom: 0, sliceTo: 80 },
        { name: "Crowd Belters", description: "Big sing-along hooks and recognizable choruses.", sliceFrom: 80, sliceTo: 220 },
        { name: "Late Night Chill", description: "Lower-key tracks for cooldown sets.", sliceFrom: 220, sliceTo: 360 },
      ];

      const seededPlaylists: Array<{ id: string; name: string; added_count: number }> = [];
      for (const plan of plans) {
        const key = plan.name.toLowerCase();
        const playlist =
          byName.get(key) ||
          (await createKaraokePlaylist(client, {
            name: plan.name,
            description: plan.description,
          }));
        byName.set(key, playlist);
        const existingItems = await listKaraokePlaylistItems(client, playlist.id);
        const existingTrackIds = new Set(existingItems.map((item) => item.track_id));
        const desiredTrackIds = trackIds.slice(plan.sliceFrom, plan.sliceTo);
        let added = 0;
        for (const trackId of desiredTrackIds) {
          if (existingTrackIds.has(trackId)) continue;
          await addKaraokePlaylistItem(client, { playlist_id: playlist.id, track_id: trackId });
          existingTrackIds.add(trackId);
          added += 1;
        }
        seededPlaylists.push({ id: playlist.id, name: playlist.name, added_count: added });
      }

      await client.query("COMMIT");
      metrics.httpRequestsTotal.inc({ route: "/api/karaoke/library/bootstrap", method: "POST", status: "200" });
      return NextResponse.json({
        ok: true,
        seeded_track_count: trackIds.length,
        target_count: body.target_count,
        playlists: seededPlaylists,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const apiErr = classifyApiError(err);
    metrics.httpRequestsTotal.inc({ route: "/api/karaoke/library/bootstrap", method: "POST", status: String(apiErr.status) });
    return jsonError(apiErr.code, apiErr.message, { status: apiErr.status, details: apiErr.details });
  }
}

