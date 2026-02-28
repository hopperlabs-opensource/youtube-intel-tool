"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { formatHms } from "@/lib/time";
import { ErrorWithRetry } from "@/components/ErrorWithRetry";
import { SkeletonLines } from "@/components/Skeleton";
import type { SearchHit } from "@yt/contracts";
import { apiFetch } from "@/lib/openai_key";

type SearchResult = { hits: SearchHit[]; embedding_error: string | null };

export function SearchPanel(props: { videoId: string; onSeekToMs: (ms: number) => void }) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"keyword" | "semantic" | "hybrid">("keyword");
  const lastQuery = useRef("");

  const capsQ = useQuery({
    queryKey: ["capabilities"],
    queryFn: async () => {
      const res = await apiFetch("/api/capabilities");
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as { embeddings?: { enabled?: boolean; reason?: string | null } };
    },
    staleTime: 30_000,
  });

  const embeddingsOk = Boolean(capsQ.data?.embeddings?.enabled);

  const search = useMutation({
    mutationFn: async (q: string) => {
      lastQuery.current = q;
      const res = await apiFetch(`/api/videos/${props.videoId}/search`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: q, mode, limit: 20 }),
      });
      if (!res.ok) {
        let msg = await res.text();
        try {
          const j = JSON.parse(msg);
          msg = j?.error?.message || msg;
        } catch {}
        throw new Error(msg);
      }
      const json = await res.json();
      return { hits: (json.hits as SearchHit[]) ?? [], embedding_error: (json.embedding_error as string | null) ?? null } satisfies SearchResult;
    },
  });

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 py-2 text-sm font-semibold">Search</div>
      <div className="px-3 pb-2">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim()) search.mutate(query.trim());
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-400"
            placeholder="Search transcript..."
          />
          <select
            value={mode}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "keyword" || v === "semantic" || v === "hybrid") setMode(v);
            }}
            className="rounded-lg border border-zinc-200 bg-white px-2 py-2 text-sm"
            title="Search mode"
          >
            <option value="keyword">Keyword</option>
            <option value="semantic" disabled={!embeddingsOk} title={!embeddingsOk ? "Embeddings are disabled" : ""}>
              Semantic
            </option>
            <option value="hybrid" disabled={!embeddingsOk} title={!embeddingsOk ? "Embeddings are disabled" : ""}>
              Hybrid
            </option>
          </select>
          <button
            type="submit"
            className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Go
          </button>
        </form>
      </div>
      <div className="h-full overflow-auto px-3 pb-4">
        {!embeddingsOk && mode !== "keyword" && (
          <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Embeddings are disabled; switch to keyword search.
            {capsQ.data?.embeddings?.reason ? ` (${capsQ.data.embeddings.reason})` : ""}
          </div>
        )}
        {search.isPending && <SkeletonLines lines={4} />}
        {search.isError && (
          <ErrorWithRetry
            message={`Search failed: ${String(search.error?.message || "")}`}
            onRetry={() => search.mutate(lastQuery.current || query.trim())}
            isRetrying={search.isPending}
          />
        )}
        {!search.isPending && !search.isError && search.data && search.data.embedding_error && mode !== "keyword" && (
          <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Semantic search unavailable; showing keyword fallback. ({search.data.embedding_error})
          </div>
        )}
        {!search.isPending && !search.isError && search.data && search.data.hits.length === 0 && (
          <div className="text-sm text-zinc-500">No results.</div>
        )}
        <div className="flex flex-col gap-2">
          {(search.data?.hits || []).map((hit) => (
            <button
              key={hit.cue_id}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left hover:border-amber-300"
              onClick={() => props.onSeekToMs(hit.start_ms)}
            >
              <div className="text-xs font-medium text-zinc-600">{formatHms(hit.start_ms)}</div>
              <div className="text-sm text-zinc-900">{hit.snippet}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
