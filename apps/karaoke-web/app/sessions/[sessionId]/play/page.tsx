"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { TranscriptCue } from "@yt/contracts";
import { getApiClient } from "@/lib/api";

function formatMs(ms: number): string {
  const safe = Math.max(0, Math.floor(ms));
  const total = Math.floor(safe / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const EMPTY_CUES: TranscriptCue[] = [];

export default function SessionPlayPage() {
  const api = getApiClient();
  const params = useParams<{ sessionId: string }>();
  const sessionId = String(params.sessionId || "");
  const qc = useQueryClient();

  const [playerName, setPlayerName] = useState("Player 1");
  const [nowMs, setNowMs] = useState(() => Date.now());

  const sessionQ = useQuery({
    queryKey: ["karaokeSession", sessionId],
    queryFn: async () => api.getKaraokeSession(sessionId),
    enabled: Boolean(sessionId),
    refetchInterval: 1000,
  });

  const session = sessionQ.data?.session;
  const queue = sessionQ.data?.queue || [];
  const leaderboard = sessionQ.data?.leaderboard || [];
  const activeItem = sessionQ.data?.active_item || queue.find((item) => item.status === "playing") || null;
  const nextQueuedItem = queue.find((item) => item.status === "queued") || null;

  const trackQ = useQuery({
    queryKey: ["karaokeTrack", activeItem?.track_id],
    queryFn: async () => api.getKaraokeTrack(activeItem!.track_id),
    enabled: Boolean(activeItem?.track_id),
  });

  const activeTrack = trackQ.data?.track;

  const transcriptsQ = useQuery({
    queryKey: ["karaokeTrackTranscripts", activeTrack?.video_id],
    queryFn: async () => api.listTranscripts(activeTrack!.video_id),
    enabled: Boolean(activeTrack?.video_id),
  });

  const transcripts = transcriptsQ.data?.transcripts || [];
  const selectedTranscript = activeTrack?.language
    ? transcripts.find((t) => t.language === activeTrack.language) || transcripts[0] || null
    : transcripts[0] || null;

  const cuesQ = useQuery({
    queryKey: ["karaokeTrackCues", selectedTranscript?.id],
    queryFn: async () => api.listCues(selectedTranscript!.id, { cursor: 0, limit: 5000 }),
    enabled: Boolean(selectedTranscript?.id),
  });

  const cues = cuesQ.data?.cues ?? EMPTY_CUES;

  const refreshSession = async () => {
    await qc.invalidateQueries({ queryKey: ["karaokeSession", sessionId] });
    await qc.invalidateQueries({ queryKey: ["karaokeTrack", activeItem?.track_id] });
  };

  const startRound = useMutation({
    mutationFn: async (queueItemId: string) => api.startKaraokeRound(sessionId, { queue_item_id: queueItemId }),
    onSuccess: refreshSession,
  });

  const queueAction = useMutation({
    mutationFn: async (payload: { itemId: string; action: "play_now" | "skip" | "complete" }) =>
      api.updateKaraokeQueueItem(sessionId, payload.itemId, { action: payload.action }),
    onSuccess: refreshSession,
  });

  const scoreEvent = useMutation({
    mutationFn: async (payload: {
      queue_item_id: string;
      cue_id: string;
      expected_at_ms: number;
      actual_at_ms: number;
    }) =>
      api.recordKaraokeScoreEvent(sessionId, {
        queue_item_id: payload.queue_item_id,
        player_name: playerName.trim() || "Player",
        cue_id: payload.cue_id,
        expected_at_ms: payload.expected_at_ms,
        actual_at_ms: payload.actual_at_ms,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["karaokeSession", sessionId] });
    },
  });

  useEffect(() => {
    if (!activeItem?.started_at) return;
    const startedAt = Date.parse(activeItem.started_at);
    if (Number.isNaN(startedAt)) return;
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
    function tick() {
      setNowMs(Date.now());
    }
  }, [activeItem?.id, activeItem?.started_at]);

  const startedAtMs = activeItem?.started_at ? Date.parse(activeItem.started_at) : Number.NaN;
  const clockMs = Number.isFinite(startedAtMs) ? Math.max(0, nowMs - startedAtMs) : 0;

  const activeCueIndex = useMemo(() => {
    if (!cues.length) return -1;
    const current = cues.findIndex((cue) => clockMs >= cue.start_ms && clockMs <= cue.end_ms);
    if (current >= 0) return current;
    const next = cues.findIndex((cue) => cue.start_ms > clockMs);
    if (next >= 0) return next;
    return cues.length - 1;
  }, [cues, clockMs]);

  const activeCue = activeCueIndex >= 0 ? cues[activeCueIndex] : null;
  const totalMs = Math.max(activeTrack?.duration_ms ?? cues[cues.length - 1]?.end_ms ?? 0, 1);
  const progressPct = Math.min(100, Math.max(0, (clockMs / totalMs) * 100));

  const themeClass = `theme-${session?.theme_id || "gold-stage"}`;

  if (sessionQ.isPending) {
    return (
      <main className="page">
        <p>Loading play screen...</p>
      </main>
    );
  }

  if (sessionQ.isError || !session) {
    return (
      <main className="page">
        <p>Session not found.</p>
        <Link href="/">Back</Link>
      </main>
    );
  }

  return (
    <main className={`page ${themeClass}`}>
      <div className="header">
        <div className="brand">
          <span className="badge">Play</span>
          <h1>{session.name}</h1>
        </div>
        <div className="row">
          <Link className="secondary" href={`/sessions/${session.id}`}>
            Host Console
          </Link>
          <Link className="secondary" href="/">
            Home
          </Link>
        </div>
      </div>

      <div className="grid two">
        <section className="panel karaoke-stage">
          <h2>Now Singing</h2>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="pill">Status: {session.status}</span>
            <span className="pill">Clock: {formatMs(clockMs)}</span>
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 19, fontWeight: 700 }}>
              {activeTrack?.title || (activeItem ? activeItem.track_id : "No active track")}
            </div>
            <div className="muted" style={{ marginTop: 2 }}>
              {activeTrack?.channel_name || "No channel metadata"}
            </div>
          </div>

          <div className="progress" style={{ marginTop: 12 }}>
            <div style={{ width: `${progressPct}%` }} />
          </div>

          <div className="karaoke-lyrics" style={{ marginTop: 12 }}>
            {!activeItem ? (
              <p className="muted">Start a round to begin.</p>
            ) : cues.length === 0 ? (
              <p className="muted">No cues yet. This track may still be ingesting transcript data.</p>
            ) : (
              cues.map((cue, idx) => (
                <div key={cue.id} className={`karaoke-line ${idx === activeCueIndex ? "active" : ""}`}>
                  <span className="muted" style={{ marginRight: 8 }}>
                    {formatMs(cue.start_ms)}
                  </span>
                  {cue.text}
                </div>
              ))
            )}
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            <input
              style={{ maxWidth: 220 }}
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Player name"
            />
            <button
              disabled={
                !activeItem ||
                !activeCue ||
                scoreEvent.isPending ||
                !playerName.trim() ||
                activeItem.status !== "playing"
              }
              onClick={() => {
                if (!activeItem || !activeCue) return;
                scoreEvent.mutate({
                  queue_item_id: activeItem.id,
                  cue_id: activeCue.id,
                  expected_at_ms: activeCue.start_ms,
                  actual_at_ms: clockMs,
                });
              }}
            >
              {scoreEvent.isPending ? "Scoring..." : "Tap On Beat"}
            </button>
            <button
              className="secondary"
              disabled={!activeItem || queueAction.isPending}
              onClick={() => {
                if (!activeItem) return;
                queueAction.mutate({ itemId: activeItem.id, action: "complete" });
              }}
            >
              Complete Track
            </button>
          </div>

          {scoreEvent.data ? (
            <p className="muted" style={{ marginTop: 8 }}>
              Last score: +{scoreEvent.data.event.awarded_points} points ({scoreEvent.data.event.timing_error_ms}ms error)
            </p>
          ) : null}
          {scoreEvent.error ? (
            <p className="muted" style={{ marginTop: 8 }}>
              Score submit failed: {(scoreEvent.error as Error).message}
            </p>
          ) : null}

          <div className="row" style={{ marginTop: 12 }}>
            <button
              disabled={!nextQueuedItem || startRound.isPending || Boolean(activeItem)}
              onClick={() => {
                if (!nextQueuedItem) return;
                startRound.mutate(nextQueuedItem.id);
              }}
            >
              {startRound.isPending ? "Starting..." : activeItem ? "Round In Progress" : "Start Next Round"}
            </button>
            {nextQueuedItem ? <span className="muted">Up next: {nextQueuedItem.requested_by}</span> : null}
          </div>

          {activeTrack?.provider_video_id ? (
            <div style={{ marginTop: 14 }}>
              <iframe
                title="karaoke-video"
                src={`https://www.youtube.com/embed/${activeTrack.provider_video_id}?autoplay=1`}
                width="100%"
                height="280"
                style={{ border: 0, borderRadius: 12 }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
          ) : null}
        </section>

        <section className="panel">
          <h2>Session State</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Pos</th>
                <th>Requested By</th>
                <th>Status</th>
                <th>Track</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((item) => (
                <tr key={item.id}>
                  <td>{item.position}</td>
                  <td>{item.requested_by}</td>
                  <td>{item.status}</td>
                  <td>{item.track_id}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ marginTop: 16 }}>Leaderboard</h3>
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
      </div>
    </main>
  );
}
