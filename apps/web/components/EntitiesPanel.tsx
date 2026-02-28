"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { Entity } from "@yt/contracts";
import type { EntityMention } from "@yt/contracts";
import { ErrorWithRetry } from "@/components/ErrorWithRetry";
import { SkeletonLines } from "@/components/Skeleton";
import { formatHms } from "@/lib/time";

export function EntitiesPanel(props: {
  videoId: string;
  atMs: number;
  onSeekToMs?: (ms: number) => void;
  onSelectCueId?: (cueId: string) => void;
}) {
  const atBucket = Math.floor(props.atMs / 5000) * 5000;
  const [selected, setSelected] = useState<Entity | null>(null);

  const q = useQuery({
    queryKey: ["entities", props.videoId, atBucket],
    queryFn: async () => {
      const res = await fetch(`/api/videos/${props.videoId}/entities?at_ms=${atBucket}&window_ms=120000`);
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      return json.entities as Entity[];
    },
  });

  const mentionsQ = useQuery({
    enabled: Boolean(selected?.id),
    queryKey: ["entityMentions", props.videoId, selected?.id],
    queryFn: async () => {
      const res = await fetch(`/api/videos/${props.videoId}/entities/${selected!.id}/mentions?limit=50`);
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      return json.mentions as EntityMention[];
    },
  });

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 py-2 text-sm font-semibold">Entities</div>
      <div className="h-full overflow-auto px-3 pb-4">
        {q.isPending && <SkeletonLines lines={4} />}
        {q.isError && (
          <ErrorWithRetry message="Failed to load entities." onRetry={() => q.refetch()} isRetrying={q.isRefetching} />
        )}
        {!q.isPending && !q.isError && (q.data || []).length === 0 && (
          <div className="text-sm text-zinc-500">No entities yet. Run ingest.</div>
        )}
        <div className="flex flex-col gap-2">
          {(q.data || []).map((e) => {
            const isSelected = selected?.id === e.id;
            return (
              <button
                key={e.id}
                className={`rounded-lg border px-3 py-2 text-left hover:border-amber-300 ${
                  isSelected ? "border-amber-400 bg-amber-50" : "border-zinc-200 bg-white"
                }`}
                onClick={() => setSelected(e)}
              >
                <div className="text-sm font-medium text-zinc-900">{e.canonical_name}</div>
                <div className="text-xs text-zinc-500">{e.type}</div>
              </button>
            );
          })}
        </div>

        {selected && (
          <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-3">
            <div className="text-sm font-semibold text-zinc-900">Mentions: {selected.canonical_name}</div>
            <div className="mt-2">
              {mentionsQ.isPending && <SkeletonLines lines={3} />}
              {mentionsQ.isError && (
                <ErrorWithRetry message="Failed to load mentions." onRetry={() => mentionsQ.refetch()} isRetrying={mentionsQ.isRefetching} />
              )}
              {!mentionsQ.isPending && !mentionsQ.isError && (mentionsQ.data || []).length === 0 && (
                <div className="text-sm text-zinc-500">No mentions found.</div>
              )}
              <div className="mt-2 flex flex-col gap-2">
                {(mentionsQ.data || []).slice(0, 20).map((m) => (
                  <button
                    key={m.id}
                    className="rounded-lg bg-zinc-50 px-2 py-2 text-left hover:bg-amber-50"
                    onClick={() => {
                      props.onSelectCueId?.(m.cue_id);
                      props.onSeekToMs?.(m.start_ms);
                    }}
                    title="Seek to mention"
                  >
                    <div className="text-xs font-medium text-zinc-600">{formatHms(m.start_ms)}</div>
                    <div className="text-xs text-zinc-800">{m.surface}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
