"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { LibraryVideo } from "@yt/contracts";
import { AppHeader } from "@/components/AppHeader";
import { ErrorWithRetry } from "@/components/ErrorWithRetry";
import { SkeletonCard } from "@/components/Skeleton";
import { getApiClient, toErrorMessage } from "@/lib/api_client";

function pickLabel(v: LibraryVideo["video"]): string {
  return v.title || v.provider_video_id;
}

export default function Home() {
  const router = useRouter();
  const api = getApiClient();

  const [url, setUrl] = useState("");
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  const [searchQ, setSearchQ] = useState("");

  const libraryQ = useQuery({
    queryKey: ["libraryPreview"],
    queryFn: async () => (await api.listLibraryVideos({ limit: 8 })).items as LibraryVideo[],
  });

  const preview = useMemo(() => (libraryQ.data || []).slice(0, 6), [libraryQ.data]);

  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_700px_at_20%_-10%,rgba(251,191,36,0.25),transparent_60%),radial-gradient(1200px_700px_at_100%_10%,rgba(24,24,27,0.08),transparent_45%)]">
      <AppHeader />

      <div className="mx-auto max-w-6xl px-5 py-12">
        <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900">
              Transcript, search, entities, context, chat
              <span className="text-amber-700">all timestamped</span>
            </div>

            <h1 className="mt-5 text-5xl font-semibold tracking-tight text-zinc-900">
              Turn YouTube into a searchable library.
            </h1>

            <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-600">
              This tool treats videos like data: ingest once, then move fast.
              <br />
              You get a synced transcript you can click through, semantic search that finds the moment, and a grounded
              chat panel that points back to exact timestamps.
            </p>

            <div className="mt-7 rounded-2xl border border-zinc-200 bg-white/70 p-4 backdrop-blur">
              <div className="text-xs font-semibold text-zinc-700">Ingest a video</div>
              <form
                className="mt-2 flex flex-col gap-2 sm:flex-row"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const u = url.trim();
                  if (!u) return;
                  setOpenError(null);
                  setOpening(true);
                  try {
                    const out = await api.resolveVideo({ url: u });
                    router.push(`/videos/${out.video.id}`);
                  } catch (err: unknown) {
                    setOpenError(toErrorMessage(err, "resolve failed"));
                  } finally {
                    setOpening(false);
                  }
                }}
              >
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-amber-400"
                  placeholder="https://www.youtube.com/watch?v=..."
                />
                <button
                  disabled={opening || !url.trim()}
                  className="rounded-xl bg-zinc-900 px-5 py-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                >
                  {opening ? "Opening..." : "Open"}
                </button>
              </form>
              {openError && (
                <div className="mt-2">
                  <ErrorWithRetry message={openError} onRetry={() => setOpenError(null)} isRetrying={opening} />
                </div>
              )}
              <div className="mt-3 text-xs text-zinc-500">
                Tip: click <span className="font-medium text-zinc-700">Ingest</span> on the video page to fetch and index
                the transcript.
              </div>
            </div>

            <div className="mt-7 rounded-2xl border border-zinc-200 bg-white/70 p-4 backdrop-blur">
              <div className="text-xs font-semibold text-zinc-700">Search your library</div>
              <form
                className="mt-2 flex flex-col gap-2 sm:flex-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  const q = searchQ.trim();
                  router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
                }}
              >
                <input
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-amber-400"
                  placeholder='e.g. "did Lex talk to the founder of OpenClaw?"'
                />
                <button
                  disabled={!searchQ.trim()}
                  className="rounded-xl border border-zinc-200 bg-white px-5 py-3 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60"
                >
                  Search
                </button>
              </form>
              <div className="mt-3 text-xs text-zinc-500">
                Ask full questions. Semantic search works best after embeddings are built during ingest.
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white/70 p-5 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-zinc-900">Recent Videos</div>
              <Link
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium hover:bg-zinc-50"
                href="/library/videos"
              >
                View library
              </Link>
            </div>

            <div className="mt-4">
              {libraryQ.isPending && (
                <div className="flex flex-col gap-2">
                  <SkeletonCard lines={2} />
                  <SkeletonCard lines={2} />
                  <SkeletonCard lines={2} />
                </div>
              )}
              {libraryQ.isError && (
                <ErrorWithRetry message="Failed to load library." onRetry={() => libraryQ.refetch()} isRetrying={libraryQ.isRefetching} />
              )}
              {!libraryQ.isPending && !libraryQ.isError && preview.length === 0 && (
                <div className="text-sm text-zinc-500">
                  Nothing yet. Resolve a link to start building your library.
                </div>
              )}

              <div className="mt-2 flex flex-col gap-2">
                {preview.map((it) => {
                  const v = it.video;
                  const t = it.latest_transcript;
                  return (
                    <Link
                      key={v.id}
                      className="flex gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 hover:border-amber-300"
                      href={`/videos/${v.id}`}
                    >
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

                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-zinc-900">{pickLabel(v)}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-mono">{v.provider_video_id}</span>
                          {v.channel_name && <span className="truncate">{v.channel_name}</span>}
                          <span className={t ? "text-emerald-700" : "text-zinc-500"}>
                            {t ? `Transcript: ${t.language}` : "Not ingested yet"}
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 rounded-2xl bg-zinc-900 p-4 text-white">
              <div className="text-xs font-semibold text-zinc-100">Synthesis</div>
              <div className="mt-2 text-sm leading-6 text-zinc-100">
                The point is not transcripts. The point is time-indexed knowledge you can query.
                <div className="mt-2 text-xs text-zinc-300">
                  Build a library, then ask: who said what, where, and when.
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-zinc-300">
                <span className="rounded-full bg-white/10 px-2 py-1">click-to-seek</span>
                <span className="rounded-full bg-white/10 px-2 py-1">semantic search</span>
                <span className="rounded-full bg-white/10 px-2 py-1">NER + mentions</span>
                <span className="rounded-full bg-white/10 px-2 py-1">context cards</span>
                <span className="rounded-full bg-white/10 px-2 py-1">grounded chat</span>
              </div>
            </div>

            <div className="mt-4 text-xs text-zinc-500">
              Power move: once your library is populated, use the Search tab to answer questions across multiple videos.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
