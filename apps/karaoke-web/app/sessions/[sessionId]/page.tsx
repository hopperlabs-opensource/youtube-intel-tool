"use client";

import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { DEFAULT_KARAOKE_UI_SETTINGS, loadKaraokeUiSettings, saveKaraokeUiSettings, type KaraokeUiSettings } from "@yt/experience-core";
import { KaraokeSkinControls, KaraokeThemeSelect } from "@yt/karaoke-ui";
import { getApiClient } from "@/lib/api";

export default function SessionPage() {
  const api = getApiClient();
  const params = useParams<{ sessionId: string }>();
  const sessionId = String(params.sessionId || "");
  const qc = useQueryClient();

  const [requestedBy, setRequestedBy] = useState("Host");
  const [queueTrackId, setQueueTrackId] = useState("");
  const [url, setUrl] = useState("");
  const [theme, setTheme] = useState("");
  const [playlistId, setPlaylistId] = useState("");
  const [joinToken, setJoinToken] = useState("");
  const [joinPath, setJoinPath] = useState("");
  const [origin, setOrigin] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [playUiSettings, setPlayUiSettings] = useState<KaraokeUiSettings>(DEFAULT_KARAOKE_UI_SETTINGS);

  const sessionQ = useQuery({
    queryKey: ["karaokeSession", sessionId],
    queryFn: async () => api.getKaraokeSession(sessionId),
    enabled: Boolean(sessionId),
    refetchInterval: 2000,
  });

  const guestRequestsQ = useQuery({
    queryKey: ["karaokeGuestRequests", sessionId],
    queryFn: async () => api.listKaraokeGuestRequests(sessionId),
    enabled: Boolean(sessionId),
    refetchInterval: 2500,
  });

  const themesQ = useQuery({
    queryKey: ["karaokeThemes"],
    queryFn: async () => api.listKaraokeThemes(),
  });

  const tracksQ = useQuery({
    queryKey: ["karaokeTracks", "sessionPage"],
    queryFn: async () => api.listKaraokeTracks({ limit: 200, sort: "updated_desc" }),
  });

  const playlistsQ = useQuery({
    queryKey: ["karaokePlaylists"],
    queryFn: async () => api.listKaraokePlaylists({ limit: 200 }),
  });

  const tracksById = useMemo(() => {
    const map = new Map<string, { id: string; title: string | null; ready_state: string }>();
    for (const t of tracksQ.data?.tracks || []) {
      map.set(t.id, { id: t.id, title: t.title, ready_state: t.ready_state });
    }
    return map;
  }, [tracksQ.data]);

  const refreshSession = async () => {
    await qc.invalidateQueries({ queryKey: ["karaokeSession", sessionId] });
    await qc.invalidateQueries({ queryKey: ["karaokeTracks"] });
    await qc.invalidateQueries({ queryKey: ["karaokeGuestRequests", sessionId] });
  };

  const addQueue = useMutation({
    mutationFn: async () => api.addKaraokeQueueItem(sessionId, { track_id: queueTrackId, requested_by: requestedBy }),
    onSuccess: async () => {
      setQueueTrackId("");
      await refreshSession();
    },
  });

  const queuePlaylist = useMutation({
    mutationFn: async () => {
      if (!playlistId) throw new Error("select playlist");
      return api.queueKaraokePlaylistToSession(sessionId, {
        playlist_id: playlistId,
        requested_by: requestedBy,
      });
    },
    onSuccess: refreshSession,
  });

  const createJoinToken = useMutation({
    mutationFn: async () => api.createKaraokeGuestToken(sessionId, { ttl_minutes: 240 }),
    onSuccess: (data) => {
      setJoinToken(data.token);
      setJoinPath(data.join_path);
    },
  });

  const resolveAndQueue = useMutation({
    mutationFn: async () => {
      const resolved = await api.karaokeResolveTrack({ url: url.trim(), language: "en" });
      await api.addKaraokeQueueItem(sessionId, { track_id: resolved.track.id, requested_by: requestedBy });
      return resolved;
    },
    onSuccess: async () => {
      setUrl("");
      await refreshSession();
    },
  });

  const updateSession = useMutation({
    mutationFn: async (payload: { status?: "draft" | "active" | "paused" | "completed"; theme_id?: string }) =>
      api.updateKaraokeSession(sessionId, payload),
    onSuccess: refreshSession,
  });

  const queueAction = useMutation({
    mutationFn: async (payload: { itemId: string; action: "play_now" | "skip" | "complete" | "move"; new_position?: number }) =>
      api.updateKaraokeQueueItem(sessionId, payload.itemId, {
        action: payload.action,
        new_position: payload.new_position,
      }),
    onSuccess: refreshSession,
  });

  const handleGuestRequest = useMutation({
    mutationFn: async (payload: { requestId: string; action: "approve" | "reject" }) =>
      api.updateKaraokeGuestRequest(sessionId, payload.requestId, {
        action: payload.action,
        requested_by: requestedBy,
      }),
    onSuccess: refreshSession,
  });

  const session = sessionQ.data?.session;
  const queue = sessionQ.data?.queue || [];
  const leaderboard = sessionQ.data?.leaderboard || [];
  const guestRequests = guestRequestsQ.data?.requests || [];
  const joinUrl = joinPath && origin ? `${origin}${joinPath}` : "";

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setOrigin(window.location.origin);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!joinUrl) {
      setQrDataUrl("");
      return;
    }
    void import("qrcode")
      .then((mod) => mod.toDataURL(joinUrl, { width: 240, margin: 1 }))
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [joinUrl]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPlayUiSettings(loadKaraokeUiSettings());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (sessionQ.isPending) {
    return (
      <main className="page">
        <p>Loading session...</p>
      </main>
    );
  }

  if (sessionQ.isError || !session) {
    return (
      <main className="page">
        <p>Session not found or unavailable.</p>
        <Link href="/">Back</Link>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="header">
        <div className="brand">
          <span className="badge">Session</span>
          <h1>{session.name}</h1>
        </div>
        <div className="row">
          <Link className="secondary" href="/">
            Home
          </Link>
          <Link className="secondary" href={`/sessions/${session.id}/play`}>
            Open Play Screen
          </Link>
        </div>
      </div>

      <div className="grid two">
        <section className="panel">
          <h2>Host Controls</h2>
          <div className="row">
            <span className="pill">Status: {session.status}</span>
            <span className="pill">Theme: {session.theme_id}</span>
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            <button className="secondary" onClick={() => updateSession.mutate({ status: "active" })}>
              Activate
            </button>
            <button className="secondary" onClick={() => updateSession.mutate({ status: "paused" })}>
              Pause
            </button>
            <button className="secondary" onClick={() => updateSession.mutate({ status: "completed" })}>
              Complete
            </button>
          </div>

          <label style={{ marginTop: 14, display: "block" }}>
            Theme
            <div className="row" style={{ marginTop: 6 }}>
              <KaraokeThemeSelect themes={themesQ.data?.themes || []} value={theme || session.theme_id} onChange={setTheme} />
              <button
                disabled={!theme.trim()}
                onClick={() => {
                  if (!theme.trim()) return;
                  updateSession.mutate({ theme_id: theme.trim() });
                }}
              >
                Apply Theme
              </button>
            </div>
          </label>

          <label style={{ marginTop: 14, display: "block" }}>
            Play Screen Skin
            <KaraokeSkinControls
              settings={playUiSettings}
              onChange={(next) => {
                setPlayUiSettings(next);
                saveKaraokeUiSettings(next);
              }}
            />
          </label>

          <label style={{ marginTop: 14, display: "block" }}>
            Requested By
            <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} />
          </label>

          <label style={{ marginTop: 14, display: "block" }}>
            Add Existing Track to Queue
            <div className="row" style={{ marginTop: 6 }}>
              <select value={queueTrackId} onChange={(e) => setQueueTrackId(e.target.value)}>
                <option value="">Select track</option>
                {(tracksQ.data?.tracks || []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title || t.provider_video_id} ({t.ready_state})
                  </option>
                ))}
              </select>
              <button disabled={!queueTrackId || addQueue.isPending} onClick={() => addQueue.mutate()}>
                Queue
              </button>
            </div>
          </label>

          <label style={{ marginTop: 14, display: "block" }}>
            Queue Playlist
            <div className="row" style={{ marginTop: 6 }}>
              <select value={playlistId} onChange={(e) => setPlaylistId(e.target.value)}>
                <option value="">Select playlist</option>
                {(playlistsQ.data?.playlists || []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button disabled={!playlistId || queuePlaylist.isPending} onClick={() => queuePlaylist.mutate()}>
                Queue Playlist
              </button>
            </div>
          </label>

          <label style={{ marginTop: 14, display: "block" }}>
            Add by YouTube URL and Queue
            <div className="row" style={{ marginTop: 6 }}>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
              />
              <button disabled={!url.trim() || resolveAndQueue.isPending} onClick={() => resolveAndQueue.mutate()}>
                Add + Queue
              </button>
            </div>
          </label>
        </section>

        <section className="panel">
          <h2>Guest Join</h2>
          <p className="muted">Generate a local join token. Guests can request songs; host approves/rejects.</p>
          <div className="row">
            <button disabled={createJoinToken.isPending} onClick={() => createJoinToken.mutate()}>
              {createJoinToken.isPending ? "Generating..." : "Generate Join Link"}
            </button>
          </div>
          {joinToken ? (
            <div style={{ marginTop: 10 }}>
              <div className="muted" style={{ fontSize: 12 }}>
                Token
              </div>
              <code>{joinToken}</code>
              {joinUrl ? (
                <>
                  <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                    Join URL
                  </div>
                  <a href={joinUrl} target="_blank" rel="noreferrer">
                    {joinUrl}
                  </a>
                  {qrDataUrl ? (
                    <div style={{ marginTop: 10 }}>
                      <Image src={qrDataUrl} alt="Guest join QR code" width={180} height={180} unoptimized />
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}

          <h3 style={{ marginTop: 14 }}>Guest Requests</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Guest</th>
                <th>Track</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {guestRequests.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.guest_name}</td>
                  <td>{tracksById.get(entry.track_id)?.title || entry.track_id}</td>
                  <td>{entry.status}</td>
                  <td>
                    <div className="row">
                      <button
                        className="secondary"
                        disabled={entry.status !== "pending" || handleGuestRequest.isPending}
                        onClick={() => handleGuestRequest.mutate({ requestId: entry.id, action: "approve" })}
                      >
                        Approve
                      </button>
                      <button
                        className="secondary"
                        disabled={entry.status !== "pending" || handleGuestRequest.isPending}
                        onClick={() => handleGuestRequest.mutate({ requestId: entry.id, action: "reject" })}
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="panel" style={{ marginTop: 14 }}>
        <h2>Leaderboard</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Points</th>
              <th>Rounds</th>
              <th>Avg Error</th>
              <th>Streak</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((entry) => (
              <tr key={entry.player_name}>
                <td>{entry.player_name}</td>
                <td>{entry.total_points}</td>
                <td>{entry.rounds_played}</td>
                <td>{entry.avg_timing_error_ms}ms</td>
                <td>{entry.streak_best}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel" style={{ marginTop: 14 }}>
        <h2>Queue</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Pos</th>
              <th>Track</th>
              <th>Status</th>
              <th>Requested By</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {queue.map((item) => {
              const track = tracksById.get(item.track_id);
              return (
                <tr key={item.id}>
                  <td>{item.position}</td>
                  <td>
                    {track?.title || item.track_id}
                    {track ? <span className="muted"> ({track.ready_state})</span> : null}
                  </td>
                  <td>{item.status}</td>
                  <td>{item.requested_by}</td>
                  <td>
                    <div className="row">
                      <button className="secondary" onClick={() => queueAction.mutate({ itemId: item.id, action: "play_now" })}>
                        Play
                      </button>
                      <button className="secondary" onClick={() => queueAction.mutate({ itemId: item.id, action: "skip" })}>
                        Skip
                      </button>
                      <button className="secondary" onClick={() => queueAction.mutate({ itemId: item.id, action: "complete" })}>
                        Done
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </main>
  );
}
