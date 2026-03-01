"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getApiClient } from "@/lib/api";

export default function KaraokeGuestJoinPage() {
  const api = getApiClient();
  const params = useParams<{ token: string }>();
  const token = String(params.token || "");

  const [guestName, setGuestName] = useState("Guest");
  const [query, setQuery] = useState("");

  const tracksQ = useQuery({
    queryKey: ["guestJoinTracks", query],
    queryFn: async () =>
      api.listKaraokeTracks({
        q: query.trim() || undefined,
        limit: 150,
        sort: "updated_desc",
      }),
    enabled: Boolean(token),
  });

  const submitRequest = useMutation({
    mutationFn: async (trackId: string) =>
      api.createKaraokeGuestRequest(token, {
        track_id: trackId,
        guest_name: guestName.trim() || "Guest",
      }),
  });

  const readyTracks = useMemo(
    () => (tracksQ.data?.tracks || []).filter((t) => t.ready_state === "ready"),
    [tracksQ.data]
  );

  return (
    <main className="page">
      <div className="header">
        <div className="brand">
          <span className="badge">Guest Join</span>
          <h1>Request a Song</h1>
        </div>
        <div className="row">
          <Link className="secondary" href="/">
            Home
          </Link>
        </div>
      </div>

      <section className="panel">
        <p className="muted">
          Local session join token received. Submit a track request and wait for host approval.
        </p>

        <label>
          Your Name
          <input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Guest name" />
        </label>

        <label style={{ marginTop: 10, display: "block" }}>
          Find a Track
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, channel, or video id"
          />
        </label>

        <table className="table" style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th>Track</th>
              <th>Channel</th>
              <th>Cues</th>
              <th>Request</th>
            </tr>
          </thead>
          <tbody>
            {readyTracks.map((t) => (
              <tr key={t.id}>
                <td>{t.title || t.provider_video_id}</td>
                <td>{t.channel_name || "Unknown"}</td>
                <td>{t.cue_count}</td>
                <td>
                  <button
                    disabled={submitRequest.isPending || !guestName.trim()}
                    onClick={() => submitRequest.mutate(t.id)}
                  >
                    Request
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {submitRequest.data ? (
          <p className="muted" style={{ marginTop: 10 }}>
            Request submitted: <code>{submitRequest.data.request.id}</code> ({submitRequest.data.request.status})
          </p>
        ) : null}
        {submitRequest.error ? (
          <p className="muted" style={{ marginTop: 10 }}>
            Request failed: {(submitRequest.error as Error).message}
          </p>
        ) : null}
      </section>
    </main>
  );
}
