import { NextResponse } from "next/server";
import { KaraokeLibraryStatsResponseSchema } from "@yt/contracts";
import { getPool, initMetrics } from "@yt/core";
import { classifyApiError, jsonError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const metrics = initMetrics();
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const tracksSummary = await client.query<{
        total: string;
        ready: string;
        pending: string;
        failed: string;
      }>(
        `
        SELECT
          COUNT(*)::text AS total,
          COUNT(*) FILTER (WHERE ready_state = 'ready')::text AS ready,
          COUNT(*) FILTER (WHERE ready_state = 'pending')::text AS pending,
          COUNT(*) FILTER (WHERE ready_state = 'failed')::text AS failed
        FROM karaoke_tracks
        `
      );

      const playlistsSummary = await client.query<{ playlists: string; items: string }>(
        `
        SELECT
          (SELECT COUNT(*)::text FROM karaoke_playlists) AS playlists,
          (SELECT COUNT(*)::text FROM karaoke_playlist_items) AS items
        `
      );

      const row = tracksSummary.rows[0] ?? { total: "0", ready: "0", pending: "0", failed: "0" };
      const playlistRow = playlistsSummary.rows[0] ?? { playlists: "0", items: "0" };

      const payload = KaraokeLibraryStatsResponseSchema.parse({
        tracks_total: Number(row.total),
        tracks_ready: Number(row.ready),
        tracks_pending: Number(row.pending),
        tracks_failed: Number(row.failed),
        playlists_total: Number(playlistRow.playlists),
        playlist_items_total: Number(playlistRow.items),
        generated_at: new Date().toISOString(),
      });

      metrics.httpRequestsTotal.inc({ route: "/api/karaoke/library/stats", method: "GET", status: "200" });
      return NextResponse.json(payload);
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const apiErr = classifyApiError(err);
    metrics.httpRequestsTotal.inc({ route: "/api/karaoke/library/stats", method: "GET", status: String(apiErr.status) });
    return jsonError(apiErr.code, apiErr.message, { status: apiErr.status, details: apiErr.details });
  }
}
