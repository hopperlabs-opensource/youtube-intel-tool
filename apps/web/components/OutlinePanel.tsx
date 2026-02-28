"use client";

import { useQuery } from "@tanstack/react-query";
import { formatHms } from "@/lib/time";
import { ErrorWithRetry } from "@/components/ErrorWithRetry";
import { SkeletonLines } from "@/components/Skeleton";
import type { VideoChapter } from "@yt/contracts";
import { getApiClient } from "@/lib/api_client";

function isActiveChapter(ch: VideoChapter, atMs: number): boolean {
  return ch.start_ms <= atMs && atMs < ch.end_ms;
}

export function OutlinePanel(props: { videoId: string; atMs: number; onSeekToMs: (ms: number) => void }) {
  const api = getApiClient();
  const tagsQ = useQuery({
    queryKey: ["videoTags", props.videoId],
    queryFn: async () => (await api.listVideoTags(props.videoId)).tags as string[],
  });

  const chaptersQ = useQuery({
    queryKey: ["videoChapters", props.videoId],
    queryFn: async () => (await api.listVideoChapters(props.videoId)).chapters as VideoChapter[],
  });

  const tags = tagsQ.data || [];
  const chapters = chaptersQ.data || [];

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 py-2 text-sm font-semibold">Outline</div>

      <div className="h-full overflow-auto px-3 pb-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-zinc-700">Chapters</div>
            <div className="text-[11px] text-zinc-500">{chapters.length ? `${chapters.length} items` : ""}</div>
          </div>

          {chaptersQ.isPending && <div className="mt-2"><SkeletonLines lines={4} /></div>}
          {chaptersQ.isError && (
            <div className="mt-2">
              <ErrorWithRetry message="Failed to load chapters." onRetry={() => chaptersQ.refetch()} isRetrying={chaptersQ.isRefetching} />
            </div>
          )}
          {!chaptersQ.isPending && !chaptersQ.isError && chapters.length === 0 && (
            <div className="mt-2 text-sm text-zinc-500">No chapters yet. Re-ingest with CLI enrichment.</div>
          )}

          <div className="mt-2 flex flex-col gap-2">
            {chapters.map((ch) => {
              const active = isActiveChapter(ch, props.atMs);
              return (
                <button
                  key={ch.id}
                  className={`rounded-lg border px-3 py-2 text-left hover:border-amber-300 ${
                    active ? "border-amber-400 bg-amber-50" : "border-zinc-200 bg-white"
                  }`}
                  onClick={() => props.onSeekToMs(ch.start_ms)}
                  title={`Seek to ${formatHms(ch.start_ms)}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-medium tabular-nums text-zinc-600">{formatHms(ch.start_ms)}</div>
                    <div className="text-[11px] text-zinc-400">{ch.source}</div>
                  </div>
                  <div className="mt-1 text-sm font-medium text-zinc-900">{ch.title}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-zinc-700">Tags</div>
            <div className="text-[11px] text-zinc-500">{tags.length ? `${tags.length} tags` : ""}</div>
          </div>

          {tagsQ.isPending && <div className="mt-2"><SkeletonLines lines={2} /></div>}
          {tagsQ.isError && (
            <div className="mt-2">
              <ErrorWithRetry message="Failed to load tags." onRetry={() => tagsQ.refetch()} isRetrying={tagsQ.isRefetching} />
            </div>
          )}
          {!tagsQ.isPending && !tagsQ.isError && tags.length === 0 && (
            <div className="mt-2 text-sm text-zinc-500">No tags yet. Re-ingest with CLI enrichment.</div>
          )}

          <div className="mt-2 flex flex-wrap gap-2">
            {tags.map((t) => (
              <span key={t} className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-700">
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
