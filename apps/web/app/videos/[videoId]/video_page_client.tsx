"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Job, Transcript, TranscriptCue, Video, VideoSpeaker } from "@yt/contracts";
import Link from "next/link";
import { YouTubePlayer, type YouTubePlayerHandle } from "@/components/YouTubePlayer";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { SearchPanel } from "@/components/SearchPanel";
import { ChatPanel } from "@/components/ChatPanel";
import { EntitiesPanel } from "@/components/EntitiesPanel";
import { ContextPanel } from "@/components/ContextPanel";
import { OutlinePanel } from "@/components/OutlinePanel";
import { SpeakersPanel } from "@/components/SpeakersPanel";
import { ErrorWithRetry } from "@/components/ErrorWithRetry";
import { SkeletonLines } from "@/components/Skeleton";
import { SettingsButton } from "@/components/SettingsButton";
import { useUiStore } from "@/lib/store";
import { useJobsStore } from "@/lib/jobs_store";
import { formatHms } from "@/lib/time";

type TabKey = "chat" | "search" | "outline" | "speakers" | "entities" | "context";
const VALID_TABS: TabKey[] = ["chat", "search", "outline", "speakers", "entities", "context"];

function isValidTab(v: string | null): v is TabKey {
  return v !== null && VALID_TABS.includes(v as TabKey);
}

function asObject(v: unknown): Record<string, unknown> | null {
  if (typeof v !== "object" || v === null) return null;
  return v as Record<string, unknown>;
}

export function VideoPageClient(props: { videoId: string; initialAtMs: number | null; initialCueId: string | null }) {
  const validVideoId = Boolean(props.videoId) && props.videoId !== "undefined";
  const playerRef = useRef<YouTubePlayerHandle>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<TabKey>("chat");

  useEffect(() => {
    const urlTab = searchParams.get("tab");
    if (isValidTab(urlTab)) setActiveTab(urlTab);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [jobId, setJobId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return localStorage.getItem(`yit:lastIngestJob:${props.videoId}`) || null;
    } catch {
      return null;
    }
  });
  const [playerReady, setPlayerReady] = useState(false);
  const [cliEnrich, setCliEnrich] = useState(true);
  const [stt, setStt] = useState(true);
  const [diarize, setDiarize] = useState(false);
  const [ingestSubmitting, setIngestSubmitting] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const didApplyInitial = useRef(false);
  const didRefreshAfterJob = useRef<string | null>(null);

  const atMs = useUiStore((s) => s.atMs);
  const followMode = useUiStore((s) => s.followMode);
  const setFollowMode = useUiStore((s) => s.setFollowMode);
  const selectedCueId = useUiStore((s) => s.selectedCueId);
  const selectCue = useUiStore((s) => s.selectCue);
  const setAtMs = useUiStore((s) => s.setAtMs);

  const rememberJob = useJobsStore((s) => s.rememberJob);
  const openInspector = useJobsStore((s) => s.openInspector);

  // Phase 7: sync tab to URL
  function switchTab(tab: TabKey) {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    router.replace(url.pathname + url.search, { scroll: false });
  }

  const videoQ = useQuery({
    enabled: validVideoId,
    queryKey: ["video", props.videoId],
    queryFn: async () => {
      const res = await fetch(`/api/videos/${props.videoId}`);
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      return json.video as Video;
    },
  });

  const transcriptsQ = useQuery({
    enabled: validVideoId,
    queryKey: ["transcripts", props.videoId],
    queryFn: async () => {
      const res = await fetch(`/api/videos/${props.videoId}/transcripts`);
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      return json.transcripts as Transcript[];
    },
  });

  const transcriptId = useMemo(() => transcriptsQ.data?.[0]?.id ?? null, [transcriptsQ.data]);

  const speakersQ = useQuery({
    enabled: validVideoId,
    queryKey: ["videoSpeakers", props.videoId],
    queryFn: async () => {
      const res = await fetch(`/api/videos/${props.videoId}/speakers`);
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      return json.speakers as VideoSpeaker[];
    },
  });

  const speakerById = useMemo(() => {
    const map: Record<string, { key: string; label: string | null }> = {};
    for (const s of speakersQ.data || []) map[s.id] = { key: s.key, label: s.label };
    return map;
  }, [speakersQ.data]);

  const cuesQ = useQuery({
    enabled: Boolean(transcriptId),
    queryKey: ["cues", transcriptId],
    queryFn: async () => {
      const res = await fetch(`/api/transcripts/${transcriptId}/cues?cursor=0&limit=5000`);
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      return json.cues as TranscriptCue[];
    },
  });

  const jobQ = useQuery({
    enabled: Boolean(jobId),
    queryKey: ["job", jobId],
    queryFn: async () => {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      return json.job as Job;
    },
    refetchInterval: (q) => {
      const status = (q.state.data as Job | undefined)?.status;
      return status === "completed" || status === "failed" ? false : 1000;
    },
  });

  const providerVideoId = videoQ.data?.provider_video_id;
  const refetchVideo = videoQ.refetch;
  const refetchTranscripts = transcriptsQ.refetch;

  // When ingest finishes, refresh video metadata + transcripts so the UI updates without reload.
  useEffect(() => {
    const status = jobQ.data?.status;
    if (status !== "completed") return;
    if (!jobId) return;
    if (didRefreshAfterJob.current === jobId) return;
    didRefreshAfterJob.current = jobId;
    void refetchVideo();
    void refetchTranscripts();
  }, [jobQ.data?.status, jobId, refetchTranscripts, refetchVideo]);

  useEffect(() => {
    if (didApplyInitial.current) return;
    if (!playerReady) return;
    if (props.initialAtMs == null) return;

    didApplyInitial.current = true;
    selectCue(props.initialCueId);
    setAtMs(props.initialAtMs);
    playerRef.current?.seekToMs(props.initialAtMs);
  }, [playerReady, props.initialAtMs, props.initialCueId, selectCue, setAtMs]);

  const ingestBusy =
    ingestSubmitting ||
    (Boolean(jobId) && jobQ.isPending ? true : false) ||
    (jobQ.data ? !["completed", "failed", "canceled"].includes(jobQ.data.status) : false);

  return (
    <div className="h-screen bg-zinc-50">
      {/* Header — flex-wrap for mobile overflow */}
      <div className="flex h-auto min-h-[56px] flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-white px-4 py-2">
        <div className="flex items-center gap-3">
          <Link className="text-sm font-semibold text-zinc-900" href="/">
            YouTube Intel
          </Link>
          <div className="flex items-center gap-1 text-xs">
            <Link className="rounded-lg px-2 py-1 text-zinc-600 hover:bg-zinc-50" href="/library/videos">
              Library
            </Link>
            <Link className="rounded-lg px-2 py-1 text-zinc-600 hover:bg-zinc-50" href="/search">
              Search
            </Link>
          </div>
          <div className="text-xs text-zinc-500">{videoQ.data?.title || providerVideoId || props.videoId}</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-zinc-600">
            <input type="checkbox" checked={followMode} onChange={(e) => setFollowMode(e.target.checked)} />
            Follow transcript
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-600" title="Use gemini/claude CLIs to enrich entities, tags, and chapters">
            <input type="checkbox" checked={cliEnrich} onChange={(e) => setCliEnrich(e.target.checked)} />
            CLI enrich
          </label>
          <label
            className="flex items-center gap-2 text-xs text-zinc-600"
            title="When captions are disabled, fall back to audio transcription (requires a configured STT provider)"
          >
            <input type="checkbox" checked={stt} onChange={(e) => setStt(e.target.checked)} />
            STT fallback
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-600" title="Run local speaker diarization (requires yt-dlp + a diarization backend)">
            <input type="checkbox" checked={diarize} onChange={(e) => setDiarize(e.target.checked)} />
            Diarize
          </label>

          <SettingsButton />

          <button
            className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
            disabled={ingestBusy || !validVideoId}
            onClick={async () => {
              setIngestSubmitting(true);
              setIngestError(null);
              try {
                const steps: string[] = [];
                if (cliEnrich) steps.push("enrich_cli");
                if (stt) steps.push("stt");
                if (diarize) steps.push("diarize");
                const res = await fetch(`/api/videos/${props.videoId}/ingest`, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  // Send an explicit allowlist; empty array means "no optional steps".
                  body: JSON.stringify({ language: "en", steps }),
                });
                const json = await res.json();
                if (!res.ok) throw new Error(json?.error?.message || "ingest failed");
                setJobId(json.job.id);
                rememberJob(json.job.id, { openDock: true, openInspector: true });
                try {
                  localStorage.setItem(`yit:lastIngestJob:${props.videoId}`, json.job.id);
                } catch {}
                await transcriptsQ.refetch();
              } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                setIngestError(msg);
              } finally {
                setIngestSubmitting(false);
              }
            }}
          >
            {ingestSubmitting ? "Starting..." : "Ingest"}
          </button>

          {jobQ.data && (
            <div className="text-xs text-zinc-600">
              {jobQ.data.status}
              {jobQ.data.progress != null ? ` (${jobQ.data.progress}%)` : ""}
            </div>
          )}

          {jobId && (
            <button
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium hover:bg-zinc-50"
              onClick={() => jobId && openInspector(jobId)}
              title="View job logs + output JSON (provenance)"
            >
              Inspect
            </button>
          )}

          {ingestError && <div className="text-xs text-red-600">Ingest failed: {ingestError}</div>}

          {jobQ.data?.status === "completed" && (() => {
            const out = asObject(jobQ.data.output_json);
            const d = out ? asObject(out.diarize) : null;
            if (!d) return null;
            const backend = typeof d.backend === "string" ? d.backend : null;
            const err = typeof d.error === "string" ? d.error : null;
            const speakers = typeof d.speakers === "number" ? d.speakers : null;
            if (!backend && !err) return null;
            if (err) {
              return (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
                  Diarize failed: {err}
                </div>
              );
            }
            return (
              <div className="text-[11px] text-zinc-500">
                Diarize: {backend}
                {typeof speakers === "number" ? ` · speakers ${speakers}` : ""}
              </div>
            );
          })()}

          {jobQ.data?.status === "completed" && (() => {
            const out = asObject(jobQ.data.output_json);
            const embErr = out?.embeddings_error;
            const embCount = out?.embeddings;
            if (typeof embErr === "string" && embErr.trim()) {
              return (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
                  Embeddings skipped: {embErr}
                </div>
              );
            }
            if (typeof embCount === "number") {
              return <div className="text-[11px] text-zinc-500">Embeddings: {embCount}</div>;
            }
            return null;
          })()}

          {jobQ.data?.status === "completed" && (() => {
            const out = asObject(jobQ.data.output_json);
            const cli = out ? asObject(out.cli_enrich) : null;
            const provider = cli && typeof cli.provider === "string" ? cli.provider : null;
            const err = cli && typeof cli.error === "string" ? cli.error : null;
            const tags = cli && typeof cli.tags === "number" ? cli.tags : null;
            const chapters = cli && typeof cli.chapters === "number" ? cli.chapters : null;
            if (!provider && !err) return null;
            if (err) {
              return (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
                  CLI enrich failed: {err}
                </div>
              );
            }
            return (
              <div className="text-[11px] text-zinc-500">
                CLI enrich: {provider}
                {typeof tags === "number" ? ` · tags ${tags}` : ""}
                {typeof chapters === "number" ? ` · chapters ${chapters}` : ""}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Phase 2: Responsive layout — stacked on mobile, 3-col grid on lg+ */}
      <div className="flex flex-col gap-3 p-3 lg:grid lg:overflow-auto lg:h-[calc(100vh-56px)] lg:grid-cols-[420px_minmax(0,1fr)_420px]">
        {/* Transcript panel */}
        <div className="order-3 max-h-[50vh] overflow-auto rounded-xl border border-zinc-200 bg-white lg:order-none lg:max-h-none">
          {transcriptsQ.isPending && (
            <div className="p-3"><SkeletonLines lines={8} /></div>
          )}
          {transcriptsQ.isError && (
            <div className="p-3">
              <ErrorWithRetry message="Failed to load transcripts list." onRetry={() => transcriptsQ.refetch()} isRetrying={transcriptsQ.isRefetching} />
            </div>
          )}
          {!transcriptsQ.isPending && !transcriptsQ.isError && !transcriptId && (
            <div className="p-3 text-sm text-zinc-500">
              No transcript yet. Click <span className="font-medium text-zinc-700">Ingest</span> above. (Some videos have subtitles disabled.)
            </div>
          )}
          {transcriptId && cuesQ.isPending && (
            <div className="p-3"><SkeletonLines lines={8} /></div>
          )}
          {transcriptId && cuesQ.isError && (
            <div className="p-3">
              <ErrorWithRetry message="Transcript load failed." onRetry={() => cuesQ.refetch()} isRetrying={cuesQ.isRefetching} />
            </div>
          )}
          {transcriptId && !cuesQ.isPending && !cuesQ.isError && cuesQ.data && (
            <TranscriptPanel
              cues={cuesQ.data}
              atMs={atMs}
              followMode={followMode}
              selectedCueId={selectedCueId}
              speakerById={speakerById}
              onSelectCueId={(id) => selectCue(id)}
              onSeekToMs={(ms) => playerRef.current?.seekToMs(ms)}
            />
          )}
        </div>

        {/* Player + Video Info */}
        <div className="order-1 flex flex-col gap-3 lg:order-none">
          <div className="rounded-xl border border-zinc-200 bg-white p-3">
            {providerVideoId ? (
              <YouTubePlayer
                ref={playerRef}
                providerVideoId={providerVideoId}
                onReady={() => setPlayerReady(true)}
                onTimeMs={(ms) => {
                  setAtMs(ms);
                }}
              />
            ) : (
              <div className="text-sm text-zinc-500">Loading video...</div>
            )}
            <div className="mt-2 text-xs text-zinc-600">t={Math.floor(atMs / 1000)}s</div>
          </div>
          {/* Phase 6: Video Info card (replaces dev notes) */}
          <div className="rounded-xl border border-zinc-200 bg-white p-3">
            <div className="text-sm font-semibold text-zinc-900">Video Info</div>
            <div className="mt-2 flex flex-col gap-1 text-sm text-zinc-600">
              {videoQ.data?.title && (
                <div className="font-medium text-zinc-900">{videoQ.data.title}</div>
              )}
              {videoQ.data?.channel_name && (
                <div>{videoQ.data.channel_name}</div>
              )}
              {typeof videoQ.data?.duration_ms === "number" && (
                <div>Duration: {formatHms(videoQ.data.duration_ms)}</div>
              )}
              {videoQ.data?.provider_video_id && (
                <a
                  className="text-xs text-amber-700 underline"
                  href={`https://www.youtube.com/watch?v=${videoQ.data.provider_video_id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Watch on YouTube
                </a>
              )}
              {!videoQ.data && !videoQ.isPending && !videoQ.isError && (
                <div className="text-xs text-zinc-400">No metadata available.</div>
              )}
            </div>
          </div>
        </div>

        {/* Right panel: tabs */}
        <div className="order-2 flex max-h-[50vh] flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white lg:order-none lg:max-h-none">
          <div className="flex flex-wrap border-b border-zinc-200">
            {VALID_TABS.map((tab) => (
              <button
                key={tab}
                className={`flex-1 px-3 py-2 text-xs font-medium ${activeTab === tab ? "bg-amber-100" : "hover:bg-zinc-50"}`}
                onClick={() => switchTab(tab)}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {activeTab === "chat" && (
              <ChatPanel
                videoId={props.videoId}
                atMs={atMs}
                onSeekToMs={(ms) => playerRef.current?.seekToMs(ms)}
                onSelectCueId={(id) => selectCue(id)}
              />
            )}
            {activeTab === "search" && (
              <SearchPanel videoId={props.videoId} onSeekToMs={(ms) => playerRef.current?.seekToMs(ms)} />
            )}
            {activeTab === "outline" && (
              <OutlinePanel
                videoId={props.videoId}
                atMs={atMs}
                onSeekToMs={(ms) => {
                  setAtMs(ms);
                  playerRef.current?.seekToMs(ms);
                }}
              />
            )}
            {activeTab === "speakers" && (
              <SpeakersPanel
                videoId={props.videoId}
                transcriptId={transcriptId}
                atMs={atMs}
                onSeekToMs={(ms) => {
                  setAtMs(ms);
                  playerRef.current?.seekToMs(ms);
                }}
              />
            )}
            {activeTab === "entities" && (
              <EntitiesPanel
                videoId={props.videoId}
                atMs={atMs}
                onSeekToMs={(ms) => playerRef.current?.seekToMs(ms)}
                onSelectCueId={(id) => selectCue(id)}
              />
            )}
            {activeTab === "context" && <ContextPanel videoId={props.videoId} atMs={atMs} />}
          </div>
        </div>
      </div>
    </div>
  );
}
