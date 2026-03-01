import { NextResponse } from "next/server";
import {
  addKaraokePlaylistItem,
  getKaraokePlaylistById,
  getKaraokeTrackById,
  getPool,
  initMetrics,
} from "@yt/core";
import { AddKaraokePlaylistItemRequestSchema, AddKaraokePlaylistItemResponseSchema } from "@yt/contracts";
import { jsonError, classifyApiError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ playlistId: string }> }) {
  const metrics = initMetrics();
  try {
    const { playlistId } = await ctx.params;
    const body = AddKaraokePlaylistItemRequestSchema.parse(await req.json().catch(() => ({})));

    const pool = getPool();
    const client = await pool.connect();
    try {
      const playlist = await getKaraokePlaylistById(client, playlistId);
      if (!playlist) {
        metrics.httpRequestsTotal.inc({ route: "/api/karaoke/playlists/:playlistId/items", method: "POST", status: "404" });
        return jsonError("not_found", "playlist not found", { status: 404 });
      }

      const track = await getKaraokeTrackById(client, body.track_id);
      if (!track) {
        metrics.httpRequestsTotal.inc({ route: "/api/karaoke/playlists/:playlistId/items", method: "POST", status: "404" });
        return jsonError("not_found", "track not found", { status: 404 });
      }

      await client.query("BEGIN");
      try {
        const item = await addKaraokePlaylistItem(client, {
          playlist_id: playlist.id,
          track_id: track.id,
          position: body.position,
        });
        await client.query("COMMIT");
        metrics.httpRequestsTotal.inc({ route: "/api/karaoke/playlists/:playlistId/items", method: "POST", status: "200" });
        return NextResponse.json(AddKaraokePlaylistItemResponseSchema.parse({ item }));
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const apiErr = classifyApiError(err);
    metrics.httpRequestsTotal.inc({ route: "/api/karaoke/playlists/:playlistId/items", method: "POST", status: String(apiErr.status) });
    return jsonError(apiErr.code, apiErr.message, { status: apiErr.status, details: apiErr.details });
  }
}
