"use client";

import { useQuery } from "@tanstack/react-query";
import type { ContextItem, Entity } from "@yt/contracts";
import { ErrorWithRetry } from "@/components/ErrorWithRetry";
import { SkeletonLines } from "@/components/Skeleton";

type Card = { entity: Entity; items: ContextItem[] };

export function ContextPanel(props: { videoId: string; atMs: number }) {
  const atBucket = Math.floor(props.atMs / 5000) * 5000;

  const q = useQuery({
    queryKey: ["context", props.videoId, atBucket],
    queryFn: async () => {
      const res = await fetch(`/api/videos/${props.videoId}/context?at_ms=${atBucket}&window_ms=120000`);
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      return json.cards as Card[];
    },
  });

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 py-2 text-sm font-semibold">Context</div>
      <div className="h-full overflow-auto px-3 pb-4">
        {q.isPending && <SkeletonLines lines={5} />}
        {q.isError && (
          <ErrorWithRetry message="Failed to load context." onRetry={() => q.refetch()} isRetrying={q.isRefetching} />
        )}
        <div className="flex flex-col gap-3">
          {(q.data || [])
            .filter((c) => c.items.length > 0)
            .map((card) => (
              <div key={card.entity.id} className="rounded-xl border border-zinc-200 bg-white p-3">
                <div className="text-sm font-semibold text-zinc-900">{card.entity.canonical_name}</div>
                <div className="mt-2 flex flex-col gap-2">
                  {card.items.map((it) => (
                    <div key={it.id} className="rounded-lg bg-zinc-50 p-2">
                      <div className="text-xs font-medium text-zinc-700">{it.source}</div>
                      <div className="text-sm font-medium text-zinc-900">{it.title}</div>
                      <div className="text-xs leading-5 text-zinc-600">{it.snippet}</div>
                      {it.url && (
                        <a className="text-xs text-amber-700 underline" href={it.url} target="_blank" rel="noreferrer">
                          Open
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

