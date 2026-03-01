import { NextResponse } from "next/server";
import {
  deleteKaraokePlaylist,
  getKaraokePlaylistById,
  getPool,
  initMetrics,
  listKaraokePlaylistItems,
  updateKaraokePlaylist,
} from "@yt/core";
import {
  DeleteKaraokePlaylistResponseSchema,
  GetKaraokePlaylistResponseSchema,
  UpdateKaraokePlaylistRequestSchema,
  UpdateKaraokePlaylistResponseSchema,
} from "@yt/contracts";
import { jsonError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ playlistId: string }> }) {
  const metrics = initMetrics();
  try {
    const { playlistId } = await ctx.params;
    const pool = getPool();
    const client = await pool.connect();
    try {
      const playlist = await getKaraokePlaylistById(client, playlistId);
      if (!playlist) {
        metrics.httpRequestsTotal.inc({ route: "/api/karaoke/playlists/:playlistId", method: "GET", status: "404" });
        return jsonError("not_found", "playlist not found", { status: 404 });
      }
      const items = await listKaraokePlaylistItems(client, playlist.id);
      metrics.httpRequestsTotal.inc({ route: "/api/karaoke/playlists/:playlistId", method: "GET", status: "200" });
      return NextResponse.json(GetKaraokePlaylistResponseSchema.parse({ playlist, items }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/karaoke/playlists/:playlistId", method: "GET", status: "400" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("invalid_request", msg, { status: 400 });
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ playlistId: string }> }) {
  const metrics = initMetrics();
  try {
    const { playlistId } = await ctx.params;
    const body = UpdateKaraokePlaylistRequestSchema.parse(await req.json().catch(() => ({})));
    const pool = getPool();
    const client = await pool.connect();
    try {
      const playlist = await updateKaraokePlaylist(client, playlistId, {
        name: body.name,
        description: body.description,
      });
      if (!playlist) {
        metrics.httpRequestsTotal.inc({ route: "/api/karaoke/playlists/:playlistId", method: "PATCH", status: "404" });
        return jsonError("not_found", "playlist not found", { status: 404 });
      }
      metrics.httpRequestsTotal.inc({ route: "/api/karaoke/playlists/:playlistId", method: "PATCH", status: "200" });
      return NextResponse.json(UpdateKaraokePlaylistResponseSchema.parse({ playlist }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/karaoke/playlists/:playlistId", method: "PATCH", status: "400" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("invalid_request", msg, { status: 400 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ playlistId: string }> }) {
  const metrics = initMetrics();
  try {
    const { playlistId } = await ctx.params;
    const pool = getPool();
    const client = await pool.connect();
    try {
      const ok = await deleteKaraokePlaylist(client, playlistId);
      if (!ok) {
        metrics.httpRequestsTotal.inc({ route: "/api/karaoke/playlists/:playlistId", method: "DELETE", status: "404" });
        return jsonError("not_found", "playlist not found", { status: 404 });
      }
      metrics.httpRequestsTotal.inc({ route: "/api/karaoke/playlists/:playlistId", method: "DELETE", status: "200" });
      return NextResponse.json(DeleteKaraokePlaylistResponseSchema.parse({ ok: true }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/karaoke/playlists/:playlistId", method: "DELETE", status: "400" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("invalid_request", msg, { status: 400 });
  }
}
