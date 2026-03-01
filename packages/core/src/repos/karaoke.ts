import type pg from "pg";
import {
  KaraokeGuestRequestSchema,
  KaraokeGuestRequestStatusSchema,
  KaraokeLeaderboardEntrySchema,
  KaraokePlaylistItemSchema,
  KaraokePlaylistSchema,
  KaraokeQueueItemSchema,
  KaraokeScoreEventSchema,
  KaraokeSessionSchema,
  KaraokeTrackReadyStateSchema,
  KaraokeTrackSchema,
  type KaraokeGuestRequest,
  type KaraokeLeaderboardEntry,
  type KaraokePlaylist,
  type KaraokePlaylistItem,
  type KaraokeQueueItem,
  type KaraokeScoreEvent,
  type KaraokeSession,
  type KaraokeSessionStatus,
  type KaraokeTrack,
} from "@yt/contracts";
import { createHash, randomUUID } from "node:crypto";
import { awardPoints } from "../karaoke/scoring";

type KaraokeTrackSort = "updated_desc" | "title_asc";

type KaraokeTrackRow = {
  id: string;
  video_id: string;
  provider_video_id: string;
  title: string | null;
  channel_name: string | null;
  thumbnail_url: string | null;
  duration_ms: number | null;
  language: string;
  ready_state: string;
  cue_count: number;
  created_at: string;
  updated_at: string;
};

function parseTrackRow(row: KaraokeTrackRow): KaraokeTrack {
  const readyState =
    row.ready_state === "ready" || row.ready_state === "failed" || row.ready_state === "pending"
      ? row.ready_state
      : "pending";
  const thumbnailUrl = (() => {
    const raw = row.thumbnail_url?.trim() ?? "";
    if (!raw) return null;
    try {
      const parsed = new URL(raw);
      return parsed.toString();
    } catch {
      return null;
    }
  })();

  return KaraokeTrackSchema.parse({
    id: row.id,
    video_id: row.video_id,
    provider_video_id: row.provider_video_id,
    title: row.title,
    channel_name: row.channel_name,
    thumbnail_url: thumbnailUrl,
    duration_ms: row.duration_ms,
    language: row.language,
    ready_state: KaraokeTrackReadyStateSchema.parse(readyState),
    cue_count: row.cue_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
}

export async function syncKaraokeTrackForVideo(
  client: pg.PoolClient,
  input: {
    video_id: string;
    provider_video_id: string;
    title: string | null;
    channel_name: string | null;
    thumbnail_url: string | null;
    duration_ms: number | null;
    language?: string;
  }
): Promise<KaraokeTrack> {
  const language = (input.language || "en").trim() || "en";

  const latestTranscript = await client.query<{ id: string }>(
    `
    SELECT id::text as id
    FROM transcripts
    WHERE video_id = $1
      AND language = $2
    ORDER BY fetched_at DESC
    LIMIT 1
    `,
    [input.video_id, language]
  );

  let cueCount = 0;
  if (latestTranscript.rowCount) {
    const transcriptId = latestTranscript.rows[0]!.id;
    const cues = await client.query<{ n: string }>(
      `
      SELECT count(*)::text as n
      FROM transcript_cues
      WHERE transcript_id = $1
      `,
      [transcriptId]
    );
    cueCount = Math.max(0, Number(cues.rows[0]?.n || 0));
  }

  const readyState: "pending" | "ready" | "failed" = cueCount > 0 ? "ready" : "pending";

  const res = await client.query<KaraokeTrackRow>(
    `
    INSERT INTO karaoke_tracks (
      video_id,
      provider_video_id,
      title,
      channel_name,
      thumbnail_url,
      duration_ms,
      language,
      ready_state,
      cue_count
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (video_id)
    DO UPDATE SET
      provider_video_id = EXCLUDED.provider_video_id,
      title = COALESCE(EXCLUDED.title, karaoke_tracks.title),
      channel_name = COALESCE(EXCLUDED.channel_name, karaoke_tracks.channel_name),
      thumbnail_url = COALESCE(EXCLUDED.thumbnail_url, karaoke_tracks.thumbnail_url),
      duration_ms = COALESCE(EXCLUDED.duration_ms, karaoke_tracks.duration_ms),
      language = EXCLUDED.language,
      ready_state = EXCLUDED.ready_state,
      cue_count = EXCLUDED.cue_count,
      updated_at = now()
    RETURNING
      id::text as id,
      video_id::text as video_id,
      provider_video_id,
      title,
      channel_name,
      thumbnail_url,
      duration_ms,
      language,
      ready_state,
      cue_count,
      created_at::text as created_at,
      updated_at::text as updated_at
    `,
    [
      input.video_id,
      input.provider_video_id,
      input.title ?? null,
      input.channel_name ?? null,
      input.thumbnail_url ?? null,
      input.duration_ms ?? null,
      language,
      readyState,
      cueCount,
    ]
  );

  return parseTrackRow(res.rows[0]!);
}

export async function getKaraokeTrackById(client: pg.PoolClient, trackId: string): Promise<KaraokeTrack | null> {
  const res = await client.query<KaraokeTrackRow>(
    `
    SELECT
      id::text as id,
      video_id::text as video_id,
      provider_video_id,
      title,
      channel_name,
      thumbnail_url,
      duration_ms,
      language,
      ready_state,
      cue_count,
      created_at::text as created_at,
      updated_at::text as updated_at
    FROM karaoke_tracks
    WHERE id = $1
    `,
    [trackId]
  );
  if (!res.rowCount) return null;
  return parseTrackRow(res.rows[0]!);
}

export async function listKaraokeTracks(
  client: pg.PoolClient,
  opts?: {
    q?: string | null;
    language?: string | null;
    ready_state?: "pending" | "ready" | "failed" | null;
    limit?: number;
    offset?: number;
    sort?: KaraokeTrackSort;
  }
): Promise<KaraokeTrack[]> {
  const q = opts?.q?.trim() || null;
  const language = opts?.language?.trim() || null;
  const readyState = opts?.ready_state ?? null;
  const limit = Math.min(Math.max(1, opts?.limit ?? 50), 200);
  const offset = Math.max(0, opts?.offset ?? 0);
  const sort = opts?.sort ?? "updated_desc";

  const orderBy =
    sort === "title_asc"
      ? "COALESCE(title, provider_video_id) ASC, updated_at DESC"
      : "updated_at DESC, created_at DESC";

  const res = await client.query<KaraokeTrackRow>(
    `
    SELECT
      id::text as id,
      video_id::text as video_id,
      provider_video_id,
      title,
      channel_name,
      thumbnail_url,
      duration_ms,
      language,
      ready_state,
      cue_count,
      created_at::text as created_at,
      updated_at::text as updated_at
    FROM karaoke_tracks
    WHERE ($1::text IS NULL OR language = $1)
      AND ($2::text IS NULL OR ready_state = $2)
      AND (
        $3::text IS NULL
        OR provider_video_id ILIKE '%' || $3 || '%'
        OR COALESCE(title, '') ILIKE '%' || $3 || '%'
        OR COALESCE(channel_name, '') ILIKE '%' || $3 || '%'
      )
    ORDER BY ${orderBy}
    LIMIT $4
    OFFSET $5
    `,
    [language, readyState, q, limit, offset]
  );

  return res.rows.map(parseTrackRow);
}

type KaraokeSessionRow = {
  id: string;
  name: string;
  status: KaraokeSessionStatus;
  theme_id: string;
  host_mode: "single_host";
  created_at: string;
  updated_at: string;
};

function parseSessionRow(row: KaraokeSessionRow): KaraokeSession {
  return KaraokeSessionSchema.parse(row);
}

export async function createKaraokeSession(
  client: pg.PoolClient,
  input: {
    name: string;
    theme_id: string;
    host_mode?: "single_host";
  }
): Promise<KaraokeSession> {
  const res = await client.query<KaraokeSessionRow>(
    `
    INSERT INTO karaoke_sessions (name, status, theme_id, host_mode)
    VALUES ($1, 'draft', $2, $3)
    RETURNING
      id::text as id,
      name,
      status,
      theme_id,
      host_mode,
      created_at::text as created_at,
      updated_at::text as updated_at
    `,
    [input.name.trim(), input.theme_id.trim(), input.host_mode ?? "single_host"]
  );
  return parseSessionRow(res.rows[0]!);
}

export async function getKaraokeSessionById(client: pg.PoolClient, sessionId: string): Promise<KaraokeSession | null> {
  const res = await client.query<KaraokeSessionRow>(
    `
    SELECT
      id::text as id,
      name,
      status,
      theme_id,
      host_mode,
      created_at::text as created_at,
      updated_at::text as updated_at
    FROM karaoke_sessions
    WHERE id = $1
    `,
    [sessionId]
  );
  if (!res.rowCount) return null;
  return parseSessionRow(res.rows[0]!);
}

export async function updateKaraokeSession(
  client: pg.PoolClient,
  sessionId: string,
  patch: Partial<{ name: string; status: KaraokeSessionStatus; theme_id: string }>
): Promise<KaraokeSession | null> {
  const hasName = patch.name !== undefined;
  const hasStatus = patch.status !== undefined;
  const hasTheme = patch.theme_id !== undefined;

  const res = await client.query<KaraokeSessionRow>(
    `
    UPDATE karaoke_sessions
    SET
      name = CASE WHEN $2::boolean THEN $3 ELSE name END,
      status = CASE WHEN $4::boolean THEN $5 ELSE status END,
      theme_id = CASE WHEN $6::boolean THEN $7 ELSE theme_id END,
      updated_at = now()
    WHERE id = $1
    RETURNING
      id::text as id,
      name,
      status,
      theme_id,
      host_mode,
      created_at::text as created_at,
      updated_at::text as updated_at
    `,
    [
      sessionId,
      hasName,
      hasName ? String(patch.name).trim() : null,
      hasStatus,
      hasStatus ? patch.status : null,
      hasTheme,
      hasTheme ? String(patch.theme_id).trim() : null,
    ]
  );
  if (!res.rowCount) return null;
  return parseSessionRow(res.rows[0]!);
}

type KaraokeQueueRow = {
  id: string;
  session_id: string;
  track_id: string;
  requested_by: string;
  position: number;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
};

function parseQueueRow(row: KaraokeQueueRow): KaraokeQueueItem {
  return KaraokeQueueItemSchema.parse(row);
}

export async function listKaraokeQueueForSession(client: pg.PoolClient, sessionId: string): Promise<KaraokeQueueItem[]> {
  const res = await client.query<KaraokeQueueRow>(
    `
    SELECT
      id::text as id,
      session_id::text as session_id,
      track_id::text as track_id,
      requested_by,
      position,
      status,
      started_at::text as started_at,
      ended_at::text as ended_at,
      created_at::text as created_at,
      updated_at::text as updated_at
    FROM karaoke_queue_items
    WHERE session_id = $1
    ORDER BY position ASC, created_at ASC
    `,
    [sessionId]
  );
  return res.rows.map(parseQueueRow);
}

export async function getKaraokeQueueItemById(client: pg.PoolClient, itemId: string): Promise<KaraokeQueueItem | null> {
  const res = await client.query<KaraokeQueueRow>(
    `
    SELECT
      id::text as id,
      session_id::text as session_id,
      track_id::text as track_id,
      requested_by,
      position,
      status,
      started_at::text as started_at,
      ended_at::text as ended_at,
      created_at::text as created_at,
      updated_at::text as updated_at
    FROM karaoke_queue_items
    WHERE id = $1
    `,
    [itemId]
  );
  if (!res.rowCount) return null;
  return parseQueueRow(res.rows[0]!);
}

export async function addKaraokeQueueItem(
  client: pg.PoolClient,
  input: { session_id: string; track_id: string; requested_by: string }
): Promise<KaraokeQueueItem> {
  const positionRes = await client.query<{ n: string }>(
    `
    SELECT COALESCE(MAX(position), -1)::text as n
    FROM karaoke_queue_items
    WHERE session_id = $1
    `,
    [input.session_id]
  );
  const maxPos = Number(positionRes.rows[0]?.n || -1);
  const nextPos = Number.isFinite(maxPos) ? maxPos + 1 : 0;

  const res = await client.query<KaraokeQueueRow>(
    `
    INSERT INTO karaoke_queue_items (session_id, track_id, requested_by, position, status)
    VALUES ($1,$2,$3,$4,'queued')
    RETURNING
      id::text as id,
      session_id::text as session_id,
      track_id::text as track_id,
      requested_by,
      position,
      status,
      started_at::text as started_at,
      ended_at::text as ended_at,
      created_at::text as created_at,
      updated_at::text as updated_at
    `,
    [input.session_id, input.track_id, input.requested_by.trim(), nextPos]
  );
  return parseQueueRow(res.rows[0]!);
}

async function reindexSessionQueue(client: pg.PoolClient, sessionId: string, orderedIds: string[]): Promise<void> {
  await client.query(
    `
    UPDATE karaoke_queue_items
    SET position = position + 10000,
        updated_at = now()
    WHERE session_id = $1
    `,
    [sessionId]
  );

  for (let i = 0; i < orderedIds.length; i++) {
    await client.query(
      `
      UPDATE karaoke_queue_items
      SET position = $3,
          updated_at = now()
      WHERE session_id = $1 AND id = $2
      `,
      [sessionId, orderedIds[i], i]
    );
  }
}

export async function moveKaraokeQueueItem(
  client: pg.PoolClient,
  input: { session_id: string; item_id: string; new_position: number }
): Promise<KaraokeQueueItem> {
  const queue = await listKaraokeQueueForSession(client, input.session_id);
  const idx = queue.findIndex((item) => item.id === input.item_id);
  if (idx === -1) throw new Error("queue item not found");

  const clamped = Math.max(0, Math.min(queue.length - 1, Math.floor(input.new_position)));
  const [moved] = queue.splice(idx, 1);
  queue.splice(clamped, 0, moved!);
  await reindexSessionQueue(
    client,
    input.session_id,
    queue.map((item) => item.id)
  );

  const updated = await getKaraokeQueueItemById(client, input.item_id);
  if (!updated) throw new Error("queue item not found");
  return updated;
}

export async function setKaraokeQueueItemStatus(
  client: pg.PoolClient,
  input: { item_id: string; status: "playing" | "skipped" | "completed" }
): Promise<KaraokeQueueItem> {
  const current = await getKaraokeQueueItemById(client, input.item_id);
  if (!current) throw new Error("queue item not found");

  if (input.status === "playing") {
    await client.query(
      `
      UPDATE karaoke_queue_items
      SET status = 'queued',
          updated_at = now()
      WHERE session_id = $1
        AND status = 'playing'
        AND id <> $2
      `,
      [current.session_id, current.id]
    );
  }

  const res = await client.query<KaraokeQueueRow>(
    `
    UPDATE karaoke_queue_items
    SET
      status = $2,
      started_at = CASE
        WHEN $2 = 'playing' AND started_at IS NULL THEN now()
        ELSE started_at
      END,
      ended_at = CASE
        WHEN $2 IN ('skipped','completed') THEN now()
        ELSE ended_at
      END,
      updated_at = now()
    WHERE id = $1
    RETURNING
      id::text as id,
      session_id::text as session_id,
      track_id::text as track_id,
      requested_by,
      position,
      status,
      started_at::text as started_at,
      ended_at::text as ended_at,
      created_at::text as created_at,
      updated_at::text as updated_at
    `,
    [input.item_id, input.status]
  );
  return parseQueueRow(res.rows[0]!);
}

export async function getActiveKaraokeQueueItem(
  client: pg.PoolClient,
  sessionId: string
): Promise<KaraokeQueueItem | null> {
  const res = await client.query<KaraokeQueueRow>(
    `
    SELECT
      id::text as id,
      session_id::text as session_id,
      track_id::text as track_id,
      requested_by,
      position,
      status,
      started_at::text as started_at,
      ended_at::text as ended_at,
      created_at::text as created_at,
      updated_at::text as updated_at
    FROM karaoke_queue_items
    WHERE session_id = $1
      AND status = 'playing'
    ORDER BY started_at DESC NULLS LAST, position ASC
    LIMIT 1
    `,
    [sessionId]
  );
  if (!res.rowCount) return null;
  return parseQueueRow(res.rows[0]!);
}

type KaraokeScoreEventRow = {
  id: string;
  session_id: string;
  queue_item_id: string;
  player_name: string;
  cue_id: string;
  expected_at_ms: number;
  actual_at_ms: number;
  timing_error_ms: number;
  awarded_points: number;
  created_at: string;
};

function parseScoreEventRow(row: KaraokeScoreEventRow): KaraokeScoreEvent {
  return KaraokeScoreEventSchema.parse(row);
}

function computeStreakBest(events: Array<{ timing_error_ms: number }>): number {
  let best = 0;
  let current = 0;
  for (const e of events) {
    if (e.timing_error_ms <= 1200) {
      current += 1;
      if (current > best) best = current;
    } else {
      current = 0;
    }
  }
  return best;
}

export async function createKaraokeScoreEvent(
  client: pg.PoolClient,
  input: {
    session_id: string;
    queue_item_id: string;
    player_name: string;
    cue_id: string;
    expected_at_ms: number;
    actual_at_ms: number;
  }
): Promise<KaraokeScoreEvent> {
  const playerName = input.player_name.trim();
  const streakRows = await client.query<{ timing_error_ms: number }>(
    `
    SELECT timing_error_ms
    FROM karaoke_score_events
    WHERE session_id = $1
      AND player_name = $2
    ORDER BY created_at DESC
    LIMIT 6
    `,
    [input.session_id, playerName]
  );

  let priorStreak = 0;
  for (const row of streakRows.rows) {
    if (row.timing_error_ms <= 1200) priorStreak += 1;
    else break;
  }

  const previewError = Math.abs(Math.max(0, input.actual_at_ms) - Math.max(0, input.expected_at_ms));
  const nextStreak = previewError <= 1200 ? priorStreak + 1 : 0;
  const scoring = awardPoints({
    expected_at_ms: input.expected_at_ms,
    actual_at_ms: input.actual_at_ms,
    current_streak: nextStreak,
  });

  const res = await client.query<KaraokeScoreEventRow>(
    `
    INSERT INTO karaoke_score_events (
      session_id,
      queue_item_id,
      player_name,
      cue_id,
      expected_at_ms,
      actual_at_ms,
      timing_error_ms,
      awarded_points
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING
      id::text as id,
      session_id::text as session_id,
      queue_item_id::text as queue_item_id,
      player_name,
      cue_id::text as cue_id,
      expected_at_ms,
      actual_at_ms,
      timing_error_ms,
      awarded_points,
      created_at::text as created_at
    `,
    [
      input.session_id,
      input.queue_item_id,
      playerName,
      input.cue_id,
      Math.max(0, Math.floor(input.expected_at_ms)),
      Math.max(0, Math.floor(input.actual_at_ms)),
      scoring.timing_error_ms,
      scoring.awarded_points,
    ]
  );

  return parseScoreEventRow(res.rows[0]!);
}

export async function listKaraokeScoreEventsForSession(
  client: pg.PoolClient,
  sessionId: string
): Promise<KaraokeScoreEvent[]> {
  const res = await client.query<KaraokeScoreEventRow>(
    `
    SELECT
      id::text as id,
      session_id::text as session_id,
      queue_item_id::text as queue_item_id,
      player_name,
      cue_id::text as cue_id,
      expected_at_ms,
      actual_at_ms,
      timing_error_ms,
      awarded_points,
      created_at::text as created_at
    FROM karaoke_score_events
    WHERE session_id = $1
    ORDER BY created_at ASC
    `,
    [sessionId]
  );
  return res.rows.map(parseScoreEventRow);
}

export async function listKaraokeLeaderboard(
  client: pg.PoolClient,
  sessionId: string
): Promise<KaraokeLeaderboardEntry[]> {
  const events = await listKaraokeScoreEventsForSession(client, sessionId);
  const byPlayer = new Map<
    string,
    {
      total_points: number;
      timing_sum: number;
      event_count: number;
      queue_item_ids: Set<string>;
      streak_best: number;
      timing_errors: number[];
    }
  >();

  for (const event of events) {
    const current =
      byPlayer.get(event.player_name) ??
      {
        total_points: 0,
        timing_sum: 0,
        event_count: 0,
        queue_item_ids: new Set<string>(),
        streak_best: 0,
        timing_errors: [],
      };

    current.total_points += event.awarded_points;
    current.timing_sum += event.timing_error_ms;
    current.event_count += 1;
    current.queue_item_ids.add(event.queue_item_id);
    current.timing_errors.push(event.timing_error_ms);
    byPlayer.set(event.player_name, current);
  }

  const entries = [...byPlayer.entries()].map(([player_name, stats]) =>
    KaraokeLeaderboardEntrySchema.parse({
      player_name,
      total_points: Math.max(0, Math.floor(stats.total_points)),
      rounds_played: stats.queue_item_ids.size,
      avg_timing_error_ms: stats.event_count ? Math.max(0, Math.floor(stats.timing_sum / stats.event_count)) : 0,
      streak_best: computeStreakBest(stats.timing_errors.map((timing_error_ms) => ({ timing_error_ms }))),
    })
  );

  entries.sort((a, b) => {
    if (b.total_points !== a.total_points) return b.total_points - a.total_points;
    if (a.avg_timing_error_ms !== b.avg_timing_error_ms) return a.avg_timing_error_ms - b.avg_timing_error_ms;
    return a.player_name.localeCompare(b.player_name);
  });

  return entries;
}

type KaraokePlaylistRow = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

function parsePlaylistRow(row: KaraokePlaylistRow): KaraokePlaylist {
  return KaraokePlaylistSchema.parse(row);
}

export async function createKaraokePlaylist(
  client: pg.PoolClient,
  input: { name: string; description?: string | null }
): Promise<KaraokePlaylist> {
  const res = await client.query<KaraokePlaylistRow>(
    `
    INSERT INTO karaoke_playlists (name, description)
    VALUES ($1, $2)
    RETURNING
      id::text as id,
      name,
      description,
      created_at::text as created_at,
      updated_at::text as updated_at
    `,
    [input.name.trim(), input.description?.trim() || null]
  );
  return parsePlaylistRow(res.rows[0]!);
}

export async function listKaraokePlaylists(client: pg.PoolClient, opts?: { limit?: number; offset?: number }): Promise<KaraokePlaylist[]> {
  const limit = Math.min(Math.max(1, opts?.limit ?? 50), 200);
  const offset = Math.max(0, opts?.offset ?? 0);
  const res = await client.query<KaraokePlaylistRow>(
    `
    SELECT
      id::text as id,
      name,
      description,
      created_at::text as created_at,
      updated_at::text as updated_at
    FROM karaoke_playlists
    ORDER BY updated_at DESC, created_at DESC
    LIMIT $1
    OFFSET $2
    `,
    [limit, offset]
  );
  return res.rows.map(parsePlaylistRow);
}

export async function getKaraokePlaylistById(client: pg.PoolClient, playlistId: string): Promise<KaraokePlaylist | null> {
  const res = await client.query<KaraokePlaylistRow>(
    `
    SELECT
      id::text as id,
      name,
      description,
      created_at::text as created_at,
      updated_at::text as updated_at
    FROM karaoke_playlists
    WHERE id = $1
    `,
    [playlistId]
  );
  if (!res.rowCount) return null;
  return parsePlaylistRow(res.rows[0]!);
}

export async function updateKaraokePlaylist(
  client: pg.PoolClient,
  playlistId: string,
  patch: Partial<{ name: string; description: string | null }>
): Promise<KaraokePlaylist | null> {
  const hasName = patch.name !== undefined;
  const hasDescription = patch.description !== undefined;
  const res = await client.query<KaraokePlaylistRow>(
    `
    UPDATE karaoke_playlists
    SET
      name = CASE WHEN $2::boolean THEN $3 ELSE name END,
      description = CASE WHEN $4::boolean THEN $5 ELSE description END,
      updated_at = now()
    WHERE id = $1
    RETURNING
      id::text as id,
      name,
      description,
      created_at::text as created_at,
      updated_at::text as updated_at
    `,
    [playlistId, hasName, hasName ? patch.name?.trim() : null, hasDescription, hasDescription ? patch.description?.trim() || null : null]
  );
  if (!res.rowCount) return null;
  return parsePlaylistRow(res.rows[0]!);
}

export async function deleteKaraokePlaylist(client: pg.PoolClient, playlistId: string): Promise<boolean> {
  const res = await client.query(
    `
    DELETE FROM karaoke_playlists
    WHERE id = $1
    `,
    [playlistId]
  );
  return (res.rowCount ?? 0) > 0;
}

type KaraokePlaylistItemRow = {
  id: string;
  playlist_id: string;
  track_id: string;
  position: number;
  added_at: string;
};

function parsePlaylistItemRow(row: KaraokePlaylistItemRow): KaraokePlaylistItem {
  return KaraokePlaylistItemSchema.parse(row);
}

export async function listKaraokePlaylistItems(client: pg.PoolClient, playlistId: string): Promise<KaraokePlaylistItem[]> {
  const res = await client.query<KaraokePlaylistItemRow>(
    `
    SELECT
      id::text as id,
      playlist_id::text as playlist_id,
      track_id::text as track_id,
      position,
      added_at::text as added_at
    FROM karaoke_playlist_items
    WHERE playlist_id = $1
    ORDER BY position ASC, added_at ASC
    `,
    [playlistId]
  );
  return res.rows.map(parsePlaylistItemRow);
}

export async function getKaraokePlaylistItemById(client: pg.PoolClient, itemId: string): Promise<KaraokePlaylistItem | null> {
  const res = await client.query<KaraokePlaylistItemRow>(
    `
    SELECT
      id::text as id,
      playlist_id::text as playlist_id,
      track_id::text as track_id,
      position,
      added_at::text as added_at
    FROM karaoke_playlist_items
    WHERE id = $1
    `,
    [itemId]
  );
  if (!res.rowCount) return null;
  return parsePlaylistItemRow(res.rows[0]!);
}

async function reindexKaraokePlaylistItems(client: pg.PoolClient, playlistId: string, orderedIds: string[]): Promise<void> {
  await client.query(
    `
    UPDATE karaoke_playlist_items
    SET position = position + 10000
    WHERE playlist_id = $1
    `,
    [playlistId]
  );

  for (let i = 0; i < orderedIds.length; i++) {
    await client.query(
      `
      UPDATE karaoke_playlist_items
      SET position = $3
      WHERE playlist_id = $1 AND id = $2
      `,
      [playlistId, orderedIds[i], i]
    );
  }
}

export async function addKaraokePlaylistItem(
  client: pg.PoolClient,
  input: { playlist_id: string; track_id: string; position?: number }
): Promise<KaraokePlaylistItem> {
  const existing = await listKaraokePlaylistItems(client, input.playlist_id);
  const insertPos =
    input.position === undefined
      ? existing.length
      : Math.max(0, Math.min(existing.length, Math.floor(input.position)));

  const tempPos = existing.length + 10000;
  const inserted = await client.query<KaraokePlaylistItemRow>(
    `
    INSERT INTO karaoke_playlist_items (playlist_id, track_id, position)
    VALUES ($1, $2, $3)
    RETURNING
      id::text as id,
      playlist_id::text as playlist_id,
      track_id::text as track_id,
      position,
      added_at::text as added_at
    `,
    [input.playlist_id, input.track_id, tempPos]
  );

  const item = parsePlaylistItemRow(inserted.rows[0]!);
  const orderedIds = existing.map((v) => v.id);
  orderedIds.splice(insertPos, 0, item.id);
  await reindexKaraokePlaylistItems(client, input.playlist_id, orderedIds);

  const updated = await getKaraokePlaylistItemById(client, item.id);
  if (!updated) throw new Error("playlist item not found");
  return updated;
}

export async function moveKaraokePlaylistItem(
  client: pg.PoolClient,
  input: { item_id: string; new_position: number }
): Promise<KaraokePlaylistItem> {
  const current = await getKaraokePlaylistItemById(client, input.item_id);
  if (!current) throw new Error("playlist item not found");

  const items = await listKaraokePlaylistItems(client, current.playlist_id);
  const idx = items.findIndex((i) => i.id === current.id);
  if (idx < 0) throw new Error("playlist item not found");
  const clamped = Math.max(0, Math.min(items.length - 1, Math.floor(input.new_position)));
  const [moved] = items.splice(idx, 1);
  items.splice(clamped, 0, moved!);
  await reindexKaraokePlaylistItems(
    client,
    current.playlist_id,
    items.map((i) => i.id)
  );
  const updated = await getKaraokePlaylistItemById(client, current.id);
  if (!updated) throw new Error("playlist item not found");
  return updated;
}

export async function deleteKaraokePlaylistItem(client: pg.PoolClient, itemId: string): Promise<{ ok: boolean; items: KaraokePlaylistItem[] }> {
  const current = await getKaraokePlaylistItemById(client, itemId);
  if (!current) return { ok: false, items: [] };

  await client.query(
    `
    DELETE FROM karaoke_playlist_items
    WHERE id = $1
    `,
    [itemId]
  );

  const remaining = await listKaraokePlaylistItems(client, current.playlist_id);
  await reindexKaraokePlaylistItems(
    client,
    current.playlist_id,
    remaining.map((i) => i.id)
  );
  return { ok: true, items: await listKaraokePlaylistItems(client, current.playlist_id) };
}

export async function queueKaraokePlaylistToSession(
  client: pg.PoolClient,
  input: { session_id: string; playlist_id: string; requested_by: string }
): Promise<KaraokeQueueItem[]> {
  const items = await listKaraokePlaylistItems(client, input.playlist_id);
  const added: KaraokeQueueItem[] = [];
  for (const item of items) {
    const queueItem = await addKaraokeQueueItem(client, {
      session_id: input.session_id,
      track_id: item.track_id,
      requested_by: input.requested_by,
    });
    added.push(queueItem);
  }
  return added;
}

function hashKaraokeGuestToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export async function createKaraokeGuestToken(
  client: pg.PoolClient,
  input: { session_id: string; ttl_minutes: number; scope?: "queue_request" }
): Promise<{ token: string; expires_at: string }> {
  const ttlMinutes = Math.max(1, Math.min(24 * 60, Math.floor(input.ttl_minutes)));
  const token = `yitkg_${input.session_id}_${randomUUID().replace(/-/g, "")}`;
  const tokenHash = hashKaraokeGuestToken(token);
  const scope = input.scope ?? "queue_request";

  const res = await client.query<{ expires_at: string }>(
    `
    INSERT INTO karaoke_session_guest_tokens (session_id, token_hash, expires_at, scope)
    VALUES ($1, $2, now() + ($3::int * interval '1 minute'), $4)
    RETURNING expires_at::text as expires_at
    `,
    [input.session_id, tokenHash, ttlMinutes, scope]
  );

  return { token, expires_at: res.rows[0]!.expires_at };
}

export async function resolveKaraokeGuestToken(
  client: pg.PoolClient,
  token: string
): Promise<{ session_id: string; expires_at: string } | null> {
  const tokenHash = hashKaraokeGuestToken(token.trim());
  const res = await client.query<{ session_id: string; expires_at: string }>(
    `
    SELECT
      session_id::text as session_id,
      expires_at::text as expires_at
    FROM karaoke_session_guest_tokens
    WHERE token_hash = $1
      AND revoked_at IS NULL
      AND expires_at > now()
    LIMIT 1
    `,
    [tokenHash]
  );
  if (!res.rowCount) return null;
  return res.rows[0]!;
}

type KaraokeGuestRequestRow = {
  id: string;
  session_id: string;
  track_id: string;
  guest_name: string;
  status: string;
  created_at: string;
  handled_at: string | null;
};

function parseGuestRequestRow(row: KaraokeGuestRequestRow): KaraokeGuestRequest {
  return KaraokeGuestRequestSchema.parse({
    ...row,
    status: KaraokeGuestRequestStatusSchema.parse(row.status),
  });
}

export async function createKaraokeGuestRequest(
  client: pg.PoolClient,
  input: { session_id: string; track_id: string; guest_name: string }
): Promise<KaraokeGuestRequest> {
  const res = await client.query<KaraokeGuestRequestRow>(
    `
    INSERT INTO karaoke_guest_requests (session_id, track_id, guest_name, status)
    VALUES ($1, $2, $3, 'pending')
    RETURNING
      id::text as id,
      session_id::text as session_id,
      track_id::text as track_id,
      guest_name,
      status,
      created_at::text as created_at,
      handled_at::text as handled_at
    `,
    [input.session_id, input.track_id, input.guest_name.trim()]
  );
  return parseGuestRequestRow(res.rows[0]!);
}

export async function listKaraokeGuestRequests(client: pg.PoolClient, sessionId: string): Promise<KaraokeGuestRequest[]> {
  const res = await client.query<KaraokeGuestRequestRow>(
    `
    SELECT
      id::text as id,
      session_id::text as session_id,
      track_id::text as track_id,
      guest_name,
      status,
      created_at::text as created_at,
      handled_at::text as handled_at
    FROM karaoke_guest_requests
    WHERE session_id = $1
    ORDER BY
      CASE status
        WHEN 'pending' THEN 0
        WHEN 'queued' THEN 1
        WHEN 'approved' THEN 2
        WHEN 'rejected' THEN 3
        ELSE 4
      END ASC,
      created_at DESC
    `,
    [sessionId]
  );
  return res.rows.map(parseGuestRequestRow);
}

export async function getKaraokeGuestRequestById(client: pg.PoolClient, requestId: string): Promise<KaraokeGuestRequest | null> {
  const res = await client.query<KaraokeGuestRequestRow>(
    `
    SELECT
      id::text as id,
      session_id::text as session_id,
      track_id::text as track_id,
      guest_name,
      status,
      created_at::text as created_at,
      handled_at::text as handled_at
    FROM karaoke_guest_requests
    WHERE id = $1
    `,
    [requestId]
  );
  if (!res.rowCount) return null;
  return parseGuestRequestRow(res.rows[0]!);
}

export async function setKaraokeGuestRequestStatus(
  client: pg.PoolClient,
  input: { request_id: string; status: "pending" | "approved" | "rejected" | "queued" }
): Promise<KaraokeGuestRequest | null> {
  const res = await client.query<KaraokeGuestRequestRow>(
    `
    UPDATE karaoke_guest_requests
    SET
      status = $2,
      handled_at = CASE WHEN $2 IN ('approved', 'rejected', 'queued') THEN now() ELSE handled_at END
    WHERE id = $1
    RETURNING
      id::text as id,
      session_id::text as session_id,
      track_id::text as track_id,
      guest_name,
      status,
      created_at::text as created_at,
      handled_at::text as handled_at
    `,
    [input.request_id, input.status]
  );
  if (!res.rowCount) return null;
  return parseGuestRequestRow(res.rows[0]!);
}
