"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import type { Job, LibraryVideo } from "@yt/contracts";
import { ErrorWithRetry } from "@/components/ErrorWithRetry";
import { SkeletonCard } from "@/components/Skeleton";
import { useJobsStore } from "@/lib/jobs_store";

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}...` : id;
}

function pickLabel(v: LibraryVideo["video"]): string {
  return v.title || v.provider_video_id;
}

export default function LibraryVideosPage() {
  const [filter, setFilter] = useState("");
  const [cliEnrich, setCliEnrich] = useState(true);
  const [stt, setStt] = useState(true);
  const [diarize, setDiarize] = useState(false);
  const rememberJob = useJobsStore((s) => s.rememberJob);

  const q = useQuery({
    queryKey: ["libraryVideos"],
    queryFn: async () => {
      const res = await fetch("/api/videos?limit=200");
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      return json.items as LibraryVideo[];
    },
  });

  const ingest = useMutation({
    mutationFn: async (videoId: string) => {
      const steps: string[] = [];
      if (cliEnrich) steps.push("enrich_cli");
      if (stt) steps.push("stt");
      if (diarize) steps.push("diarize");
      const res = await fetch(`/api/videos/${videoId}/ingest`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Send an explicit allowlist; empty array means "no optional steps".
        body: JSON.stringify({ language: "en", steps }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "ingest failed");
      return json.job as Job;
    },
    onSuccess: (job, videoId) => {
      rememberJob(job.id, { openDock: true, openInspector: true });
      try {
        localStorage.setItem(`yit:lastIngestJob:${videoId}`, job.id);
      } catch {}
    },
  });

  const items = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const arr = q.data || [];
    if (!f) return arr;
    return arr.filter((it) => {
      const v = it.video;
      const title = (v.title || "").toLowerCase();
      const channel = (v.channel_name || "").toLowerCase();
      return (
        v.provider_video_id.toLowerCase().includes(f) ||
        v.url.toLowerCase().includes(f) ||
        title.includes(f) ||
        channel.includes(f)
      );
    });
  }, [q.data, filter]);

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-amber-400"
          placeholder="Filter by title, channel, URL, or video id..."
        />
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-3 text-xs text-zinc-700">
            <input type="checkbox" checked={cliEnrich} onChange={(e) => setCliEnrich(e.target.checked)} />
            CLI enrich
          </label>
          <label
            className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-3 text-xs text-zinc-700"
            title="When captions are disabled, fall back to audio transcription (requires a configured STT provider)"
          >
            <input type="checkbox" checked={stt} onChange={(e) => setStt(e.target.checked)} />
            STT fallback
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-3 text-xs text-zinc-700">
            <input type="checkbox" checked={diarize} onChange={(e) => setDiarize(e.target.checked)} />
            Diarize
          </label>
          <button
            className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium hover:bg-zinc-50"
            onClick={() => q.refetch()}
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white/70 backdrop-blur">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div className="text-xs font-medium text-zinc-600">{items.length.toLocaleString()} videos</div>
          {ingest.isError && <div className="text-xs text-red-600">Ingest failed: {String(ingest.error?.message || "")}</div>}
          {ingest.data && <div className="text-xs text-zinc-600">Ingest job: {shortId(ingest.data.id)}</div>}
        </div>

        {q.isPending && (
          <div className="p-4 flex flex-col gap-2">
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </div>
        )}
        {q.isError && (
          <div className="p-4">
            <ErrorWithRetry message="Failed to load library." onRetry={() => q.refetch()} isRetrying={q.isRefetching} />
          </div>
        )}

        {!q.isPending && !q.isError && items.length === 0 && (
          <div className="p-4 text-sm text-zinc-500">No videos yet. Paste a link in the Ingest tab.</div>
        )}

        <div className="divide-y divide-zinc-200">
          {items.map((it) => {
            const v = it.video;
            const t = it.latest_transcript;
            const label = pickLabel(v);
            const status = t ? `Transcript: ${t.language} (${t.source})` : "No transcript yet";

            return (
              <div key={v.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="h-14 w-24 shrink-0 overflow-hidden rounded-xl bg-zinc-100">
                    {v.thumbnail_url || v.provider_video_id ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={v.thumbnail_url || `https://i.ytimg.com/vi/${v.provider_video_id}/hqdefault.jpg`}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-zinc-400">
                        THUMB
                      </div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-zinc-900">{label}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-mono">{v.provider_video_id}</span>
                      {v.channel_name && <span className="truncate">{v.channel_name}</span>}
                      <span className={t ? "text-emerald-700" : "text-zinc-500"}>{status}</span>
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium hover:bg-zinc-50"
                    href={`/videos/${v.id}`}
                  >
                    Open
                  </Link>
                  <button
                    className="rounded-xl bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                    disabled={ingest.isPending}
                    onClick={() => ingest.mutate(v.id)}
                    title="Re-run ingest (refresh transcript/chunks/entities/context)"
                  >
                    Ingest
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
