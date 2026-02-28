"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { VideoSource } from "@yt/contracts";
import { AppHeader } from "@/components/AppHeader";
import { ErrorWithRetry } from "@/components/ErrorWithRetry";
import { getApiClient, toErrorMessage } from "@/lib/api_client";
import { formatHms } from "@/lib/time";

type DiscoverTab = "search" | "channel" | "playlist";
type DiscoverResponse = { items: VideoSource[] };

export default function YouTubeSearchPage() {
  const api = getApiClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<DiscoverTab>("search");

  useEffect(() => {
    const urlTab = searchParams.get("tab");
    if ((["search", "channel", "playlist"] as DiscoverTab[]).includes(urlTab as DiscoverTab)) {
      setTab(urlTab as DiscoverTab);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function switchTab(t: DiscoverTab) {
    setTab(t);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    router.replace(url.pathname + url.search, { scroll: false });
  }
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState("");
  const [playlistUrl, setPlaylistUrl] = useState("");

  const discover = useMutation({
    mutationFn: async (input: { tab: DiscoverTab; value: string }) => {
      const v = input.value.trim();
      if (!v) throw new Error("input is empty");
      try {
        if (input.tab === "channel") {
          return (await api.youtubeChannelUploads({ handle_or_url: v, take: 50, cache_hours: 24 })) as DiscoverResponse;
        }
        if (input.tab === "playlist") {
          return (await api.youtubePlaylistItems({ url: v, take: 200, cache_hours: 24 })) as DiscoverResponse;
        }
        return (await api.youtubeSearch({ query: v, take: 12, cache_hours: 24 })) as DiscoverResponse;
      } catch (err: unknown) {
        throw new Error(toErrorMessage(err, "youtube discovery failed"));
      }
    },
  });

  const resolveAndOpen = useMutation({
    mutationFn: async (url: string) => {
      try {
        const json = await api.resolveVideo({ url });
        return json.video as { id: string };
      } catch (err: unknown) {
        throw new Error(toErrorMessage(err, "resolve failed"));
      }
    },
    onSuccess: (video) => {
      router.push(`/videos/${video.id}`);
    },
  });

  const items = useMemo(() => discover.data?.items || [], [discover.data]);

  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_700px_at_20%_-10%,rgba(251,191,36,0.20),transparent_60%),radial-gradient(1200px_700px_at_100%_10%,rgba(24,24,27,0.08),transparent_45%)]">
      <AppHeader />

      <div className="mx-auto max-w-6xl px-5 py-10">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Search YouTube</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
          Discover videos without ingesting first. When you see a match, ingest it into your local library.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          {(
            [
              { key: "search", label: "Search" },
              { key: "channel", label: "Channel uploads" },
              { key: "playlist", label: "Playlist" },
            ] as Array<{ key: DiscoverTab; label: string }>
          ).map((t) => (
            <button
              key={t.key}
              className={
                tab === t.key
                  ? "rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900"
                  : "rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              }
              onClick={() => switchTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form
          className="mt-6 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (tab === "channel") discover.mutate({ tab, value: channel });
            else if (tab === "playlist") discover.mutate({ tab, value: playlistUrl });
            else discover.mutate({ tab, value: query });
          }}
        >
          {tab === "channel" ? (
            <input
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-amber-400"
              placeholder='e.g. "@lexfridman" or "https://www.youtube.com/@lexfridman/videos"'
            />
          ) : tab === "playlist" ? (
            <input
              value={playlistUrl}
              onChange={(e) => setPlaylistUrl(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-amber-400"
              placeholder='e.g. "https://www.youtube.com/playlist?list=..."'
            />
          ) : (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-amber-400"
              placeholder='e.g. "lex fridman openai", "2026 world series breakdown"'
            />
          )}
          <button
            type="submit"
            className="rounded-xl bg-zinc-900 px-5 py-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
            disabled={
              discover.isPending ||
              (tab === "channel" ? !channel.trim() : tab === "playlist" ? !playlistUrl.trim() : !query.trim())
            }
          >
            {discover.isPending ? "Searching YouTube..." : tab === "search" ? "Search" : "Load"}
          </button>
        </form>

        {discover.isPending && (
          <div className="mt-3 text-xs text-zinc-500">This can take up to a minute for large channels...</div>
        )}

        {discover.isError && (
          <div className="mt-4">
            <ErrorWithRetry
              message={String(discover.error?.message || "")}
              onRetry={() => {
                if (tab === "channel") discover.mutate({ tab, value: channel });
                else if (tab === "playlist") discover.mutate({ tab, value: playlistUrl });
                else discover.mutate({ tab, value: query });
              }}
              isRetrying={discover.isPending}
            />
            {String(discover.error?.message || "").includes("yt-dlp") && (
              <div className="mt-2 text-xs text-red-700">
                Install: <span className="font-mono">brew install yt-dlp</span>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white/70 backdrop-blur">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
            <div className="text-xs font-medium text-zinc-600">{items.length.toLocaleString()} results</div>
            <div className="text-xs text-zinc-500">Discovery uses yt-dlp (no API keys).</div>
          </div>

          {items.length === 0 && !discover.isPending && !discover.isError && (
            <div className="p-4 text-sm text-zinc-500">Run a discovery query to see results.</div>
          )}

          <div className="divide-y divide-zinc-200">
            {items.map((v) => (
              <div key={`${v.provider_video_id}:${v.rank}`} className="flex items-center justify-between gap-3 px-4 py-3">
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
                    <div className="truncate text-sm font-medium text-zinc-900">{v.title || v.provider_video_id}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-mono">{v.provider_video_id}</span>
                      {v.channel_name && <span className="truncate">{v.channel_name}</span>}
                      {typeof v.duration_ms === "number" && (
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-mono">{formatHms(v.duration_ms)}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium hover:bg-zinc-50"
                    href={v.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open
                  </Link>
                  <button
                    className="rounded-xl bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                    disabled={resolveAndOpen.isPending}
                    onClick={() => resolveAndOpen.mutate(v.url)}
                    title="Resolve and open in the transcript viewer"
                  >
                    {resolveAndOpen.isPending ? "Ingesting..." : "Ingest"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
