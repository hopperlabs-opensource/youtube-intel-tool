"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getApiClient } from "@/lib/api";

export default function KaraokeHomePage() {
  const api = getApiClient();
  const router = useRouter();
  const qc = useQueryClient();

  const [url, setUrl] = useState("");
  const [language, setLanguage] = useState("en");
  const [query, setQuery] = useState("");
  const [seed, setSeed] = useState<Record<string, boolean>>({});
  const [sessionName, setSessionName] = useState("Friday Night Session");
  const [themeId, setThemeId] = useState("gold-stage");
  const [openSessionId, setOpenSessionId] = useState("");

  const tracksQ = useQuery({
    queryKey: ["karaokeTracks", query],
    queryFn: async () =>
      api.listKaraokeTracks({
        q: query.trim() || undefined,
        limit: 200,
        sort: "updated_desc",
      }),
  });

  const themesQ = useQuery({
    queryKey: ["karaokeThemes"],
    queryFn: async () => api.listKaraokeThemes(),
  });

  const resolveTrack = useMutation({
    mutationFn: async () => api.karaokeResolveTrack({ url: url.trim(), language }),
    onSuccess: () => {
      setUrl("");
      void qc.invalidateQueries({ queryKey: ["karaokeTracks"] });
    },
  });

  const createSession = useMutation({
    mutationFn: async () => {
      const trackIds = Object.keys(seed).filter((id) => seed[id]);
      return api.createKaraokeSession({
        name: sessionName,
        theme_id: themeId,
        seed_track_ids: trackIds,
      });
    },
    onSuccess: (data) => {
      router.push(`/sessions/${data.session.id}`);
    },
  });

  const tracks = tracksQ.data?.tracks || [];
  const selectedCount = useMemo(() => Object.values(seed).filter(Boolean).length, [seed]);

  return (
    <main className="page">
      <div className="header">
        <div className="brand">
          <span className="badge">Local OSS</span>
          <h1>Eureka Karaoke Tube</h1>
        </div>
        <div className="row">
          <Link className="secondary" href="https://github.com/hopperlabs-opensource/youtube-intel-tool" target="_blank">
            Docs
          </Link>
        </div>
      </div>

      <div className="grid two">
        <section className="panel">
          <h2>Track Catalog</h2>
          <p className="muted">Bring your own YouTube links. Tracks become ready once transcript cues are available.</p>

          <div className="row">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
            />
            <select value={language} onChange={(e) => setLanguage(e.target.value)} style={{ maxWidth: 120 }}>
              <option value="en">en</option>
              <option value="es">es</option>
            </select>
            <button disabled={resolveTrack.isPending || !url.trim()} onClick={() => resolveTrack.mutate()}>
              {resolveTrack.isPending ? "Adding..." : "Add Track"}
            </button>
          </div>
          {resolveTrack.error && <p className="muted">Add track failed: {(resolveTrack.error as Error).message}</p>}

          <div className="row" style={{ marginTop: 10 }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by title/channel/video id"
            />
          </div>

          <div style={{ maxHeight: 420, overflow: "auto", marginTop: 10 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Seed</th>
                  <th>Track</th>
                  <th>State</th>
                  <th>Cues</th>
                </tr>
              </thead>
              <tbody>
                {tracks.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={Boolean(seed[t.id])}
                        onChange={(e) => setSeed((prev) => ({ ...prev, [t.id]: e.currentTarget.checked }))}
                      />
                    </td>
                    <td>
                      <div>{t.title || t.provider_video_id}</div>
                      <div className="muted" style={{ fontSize: 11 }}>
                        {t.channel_name || "Unknown channel"}
                      </div>
                    </td>
                    <td>
                      <span className="pill">{t.ready_state}</span>
                    </td>
                    <td>{t.cue_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <h2>Start Session</h2>
          <p className="muted">Single-host local party mode with queue, rounds, scoring, and themes.</p>

          <label>
            Session Name
            <input value={sessionName} onChange={(e) => setSessionName(e.target.value)} />
          </label>

          <label>
            Theme
            <select value={themeId} onChange={(e) => setThemeId(e.target.value)}>
              {(themesQ.data?.themes || []).map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.name}
                </option>
              ))}
            </select>
          </label>

          <div className="row" style={{ marginTop: 12 }}>
            <button disabled={createSession.isPending || !sessionName.trim()} onClick={() => createSession.mutate()}>
              {createSession.isPending ? "Creating..." : `Create Session (${selectedCount} seeded tracks)`}
            </button>
          </div>
          {createSession.error && <p className="muted">Create session failed: {(createSession.error as Error).message}</p>}

          <hr style={{ borderColor: "#2f3845", margin: "16px 0" }} />

          <h3>Open Existing Session</h3>
          <div className="row">
            <input
              value={openSessionId}
              onChange={(e) => setOpenSessionId(e.target.value)}
              placeholder="session id"
            />
            <button className="secondary" disabled={!openSessionId.trim()} onClick={() => router.push(`/sessions/${openSessionId.trim()}`)}>
              Open
            </button>
          </div>

          <p className="muted" style={{ marginTop: 18 }}>
            Local-only warning applies. This UI is not hardened for public internet serving.
          </p>
        </section>
      </div>
    </main>
  );
}
