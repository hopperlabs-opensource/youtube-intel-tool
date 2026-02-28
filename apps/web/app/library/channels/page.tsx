"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import type { LibraryChannel } from "@yt/contracts";
import { ErrorWithRetry } from "@/components/ErrorWithRetry";
import { SkeletonCard } from "@/components/Skeleton";

export default function LibraryChannelsPage() {
  const [filter, setFilter] = useState("");

  const q = useQuery({
    queryKey: ["libraryChannels"],
    queryFn: async () => {
      const res = await fetch("/api/library/channels?limit=500");
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      return json.channels as LibraryChannel[];
    },
  });

  const items = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const arr = q.data || [];
    if (!f) return arr;
    return arr.filter((c) => c.channel_name.toLowerCase().includes(f));
  }, [q.data, filter]);

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-amber-400"
          placeholder="Filter channels..."
        />
        <button
          className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium hover:bg-zinc-50"
          onClick={() => q.refetch()}
        >
          Refresh
        </button>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white/70 backdrop-blur">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div className="text-xs font-medium text-zinc-600">{items.length.toLocaleString()} channels</div>
          {q.isError && <div className="text-xs text-red-600">Failed: {String(q.error?.message || "")}</div>}
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
            <ErrorWithRetry message="Failed to load channels." onRetry={() => q.refetch()} isRetrying={q.isRefetching} />
          </div>
        )}

        {!q.isPending && !q.isError && items.length === 0 && (
          <div className="p-4 text-sm text-zinc-500">No channels yet.</div>
        )}

        <div className="divide-y divide-zinc-200">
          {items.map((c) => (
            <div key={c.channel_name} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-zinc-900">{c.channel_name}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5">{c.videos.toLocaleString()} videos</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5">{c.ingested.toLocaleString()} ingested</span>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Link
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium hover:bg-zinc-50"
                  href={`/search?channel=${encodeURIComponent(c.channel_name)}`}
                  title="Search within this channel (type a query on the search page)"
                >
                  Search
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

