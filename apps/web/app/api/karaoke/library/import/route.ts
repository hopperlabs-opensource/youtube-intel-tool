import { NextResponse } from "next/server";
import {
  addKaraokePlaylistItem,
  createKaraokePlaylist,
  fetchYouTubeOEmbed,
  getPool,
  initMetrics,
  listKaraokePlaylistItems,
  listKaraokePlaylists,
  parseYouTubeUrl,
  syncKaraokeTrackForVideo,
  updateVideoMetadata,
  upsertVideoByProviderId,
} from "@yt/core";
import { KaraokeLibraryImportRequestSchema, KaraokeLibraryImportResponseSchema } from "@yt/contracts";
import { classifyApiError, jsonError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ImportedTrack = {
  id: string;
  key: string;
};

function manifestTrackKey(url: string, language: string): string {
  return `${language.trim().toLowerCase()}::${url.trim()}`;
}

export async function POST(req: Request) {
  const metrics = initMetrics();
  try {
    const body = KaraokeLibraryImportRequestSchema.parse(await req.json().catch(() => ({})));

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const trackByKey = new Map<string, ImportedTrack>();
      const failed: Array<{ url: string; reason: string }> = [];
      let importedTrackCount = 0;

      const upsertManifestTrack = async (url: string, language: string) => {
        const key = manifestTrackKey(url, language);
        if (trackByKey.has(key)) return;

        try {
          const parsed = parseYouTubeUrl(url);
          const watchUrl = `https://www.youtube.com/watch?v=${parsed.provider_video_id}`;
          const video = await upsertVideoByProviderId(client, {
            provider: "youtube",
            provider_video_id: parsed.provider_video_id,
            url: watchUrl,
          });

          const meta = await fetchYouTubeOEmbed({ url: watchUrl, timeoutMs: 1500 }).catch(() => null);
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
            language,
          });

          trackByKey.set(key, { id: track.id, key });
          importedTrackCount += 1;
        } catch (err: unknown) {
          failed.push({
            url,
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      };

      for (const track of body.manifest.tracks) {
        const language = track.language?.trim() || body.manifest.language;
        await upsertManifestTrack(track.url, language);
      }

      const existingPlaylists = await listKaraokePlaylists(client, { limit: 500, offset: 0 });
      const playlistByName = new Map(existingPlaylists.map((playlist) => [playlist.name.trim().toLowerCase(), playlist]));

      let importedPlaylistCount = 0;
      let importedPlaylistItemCount = 0;

      for (const playlistManifest of body.manifest.playlists) {
        const playlistKey = playlistManifest.name.trim().toLowerCase();
        const playlist =
          playlistByName.get(playlistKey) ??
          (await createKaraokePlaylist(client, {
            name: playlistManifest.name,
            description: playlistManifest.description ?? null,
          }));

        if (!playlistByName.has(playlistKey)) importedPlaylistCount += 1;
        playlistByName.set(playlistKey, playlist);

        const existingItems = await listKaraokePlaylistItems(client, playlist.id);
        const existingTrackIds = new Set(existingItems.map((item) => item.track_id));

        for (const track of playlistManifest.tracks) {
          const language = track.language?.trim() || body.manifest.language;
          await upsertManifestTrack(track.url, language);
          const key = manifestTrackKey(track.url, language);
          const imported = trackByKey.get(key);
          if (!imported) continue;
          if (existingTrackIds.has(imported.id)) continue;
          await addKaraokePlaylistItem(client, { playlist_id: playlist.id, track_id: imported.id });
          existingTrackIds.add(imported.id);
          importedPlaylistItemCount += 1;
        }
      }

      await client.query("COMMIT");
      const payload = KaraokeLibraryImportResponseSchema.parse({
        ok: true,
        imported_track_count: importedTrackCount,
        imported_playlist_count: importedPlaylistCount,
        imported_playlist_item_count: importedPlaylistItemCount,
        failed,
      });
      metrics.httpRequestsTotal.inc({ route: "/api/karaoke/library/import", method: "POST", status: "200" });
      return NextResponse.json(payload);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const apiErr = classifyApiError(err);
    metrics.httpRequestsTotal.inc({ route: "/api/karaoke/library/import", method: "POST", status: String(apiErr.status) });
    return jsonError(apiErr.code, apiErr.message, { status: apiErr.status, details: apiErr.details });
  }
}
