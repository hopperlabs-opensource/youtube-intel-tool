import { NextResponse } from "next/server";
import {
  deleteKaraokePlaylistItem,
  getKaraokePlaylistById,
  getKaraokePlaylistItemById,
  getPool,
  initMetrics,
  listKaraokePlaylistItems,
  moveKaraokePlaylistItem,
} from "@yt/core";
import {
  DeleteKaraokePlaylistItemResponseSchema,
  UpdateKaraokePlaylistItemRequestSchema,
  UpdateKaraokePlaylistItemResponseSchema,
} from "@yt/contracts";
import { jsonError, classifyApiError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ playlistId: string; itemId: string }> }) {
  const metrics = initMetrics();
  try {
    const { playlistId, itemId } = await ctx.params;
    const body = UpdateKaraokePlaylistItemRequestSchema.parse(await req.json().catch(() => ({})));

    const pool = getPool();
    const client = await pool.connect();
    try {
      const playlist = await getKaraokePlaylistById(client, playlistId);
      if (!playlist) {
        metrics.httpRequestsTotal.inc({ route: "/api/karaoke/playlists/:playlistId/items/:itemId", method: "PATCH", status: "404" });
        return jsonError("not_found", "playlist not found", { status: 404 });
      }

      const item = await getKaraokePlaylistItemById(client, itemId);
      if (!item || item.playlist_id !== playlist.id) {
        metrics.httpRequestsTotal.inc({ route: "/api/karaoke/playlists/:playlistId/items/:itemId", method: "PATCH", status: "404" });
        return jsonError("not_found", "playlist item not found", { status: 404 });
      }

      await client.query("BEGIN");
      try {
        const moved = await moveKaraokePlaylistItem(client, { item_id: item.id, new_position: body.position });
        const items = await listKaraokePlaylistItems(client, playlist.id);
        await client.query("COMMIT");
        metrics.httpRequestsTotal.inc({ route: "/api/karaoke/playlists/:playlistId/items/:itemId", method: "PATCH", status: "200" });
        return NextResponse.json(UpdateKaraokePlaylistItemResponseSchema.parse({ item: moved, items }));
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const apiErr = classifyApiError(err);
    metrics.httpRequestsTotal.inc({ route: "/api/karaoke/playlists/:playlistId/items/:itemId", method: "PATCH", status: String(apiErr.status) });
    return jsonError(apiErr.code, apiErr.message, { status: apiErr.status, details: apiErr.details });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ playlistId: string; itemId: string }> }) {
  const metrics = initMetrics();
  try {
    const { playlistId, itemId } = await ctx.params;

    const pool = getPool();
    const client = await pool.connect();
    try {
      const playlist = await getKaraokePlaylistById(client, playlistId);
      if (!playlist) {
        metrics.httpRequestsTotal.inc({ route: "/api/karaoke/playlists/:playlistId/items/:itemId", method: "DELETE", status: "404" });
        return jsonError("not_found", "playlist not found", { status: 404 });
      }

      const item = await getKaraokePlaylistItemById(client, itemId);
      if (!item || item.playlist_id !== playlist.id) {
        metrics.httpRequestsTotal.inc({ route: "/api/karaoke/playlists/:playlistId/items/:itemId", method: "DELETE", status: "404" });
        return jsonError("not_found", "playlist item not found", { status: 404 });
      }

      await client.query("BEGIN");
      try {
        const out = await deleteKaraokePlaylistItem(client, item.id);
        await client.query("COMMIT");
        metrics.httpRequestsTotal.inc({ route: "/api/karaoke/playlists/:playlistId/items/:itemId", method: "DELETE", status: "200" });
        return NextResponse.json(DeleteKaraokePlaylistItemResponseSchema.parse({ ok: out.ok, items: out.items }));
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const apiErr = classifyApiError(err);
    metrics.httpRequestsTotal.inc({ route: "/api/karaoke/playlists/:playlistId/items/:itemId", method: "DELETE", status: String(apiErr.status) });
    return jsonError(apiErr.code, apiErr.message, { status: apiErr.status, details: apiErr.details });
  }
}
