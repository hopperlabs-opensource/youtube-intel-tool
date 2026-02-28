"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CapabilitiesResponse, LibraryChannel, LibraryPerson, LibrarySearchHit, LibraryTopic, SearchMode } from "@yt/contracts";
import { AppHeader } from "@/components/AppHeader";
import { ErrorWithRetry } from "@/components/ErrorWithRetry";
import { formatHms } from "@/lib/time";
import { getApiClient, toErrorMessage } from "@/lib/api_client";

type SearchResponse = { hits: LibrarySearchHit[]; embedding_error: string | null };

export function SearchPageClient(props: { initialQuery: string; initialChannel: string | null; initialTopic: string | null; initialPerson: string | null }) {
  const api = getApiClient();
  const router = useRouter();
  const didAutoSearch = useRef(false);
  const [query, setQuery] = useState(() => props.initialQuery);
  const [mode, setMode] = useState<SearchMode>("keyword");
  const [channel, setChannel] = useState<string | null>(() => props.initialChannel);
  const [topic, setTopic] = useState<string | null>(() => props.initialTopic);
  const [person, setPerson] = useState<string | null>(() => props.initialPerson);

  const channelsQ = useQuery({
    queryKey: ["facetChannels"],
    queryFn: async () => (await api.listLibraryChannels({ limit: 500 })).channels as LibraryChannel[],
  });

  const topicsQ = useQuery({
    queryKey: ["facetTopics"],
    queryFn: async () => (await api.listLibraryTopics({ limit: 500 })).topics as LibraryTopic[],
  });

  const peopleQ = useQuery({
    queryKey: ["facetPeople"],
    queryFn: async () => (await api.listLibraryPeople({ limit: 500 })).people as LibraryPerson[],
  });

  const capsQ = useQuery({
    queryKey: ["capabilities"],
    queryFn: async () => (await api.capabilities()) as CapabilitiesResponse,
    staleTime: 30_000,
  });

  const embeddingsOk = Boolean(capsQ.data?.embeddings.enabled);

  const search = useMutation({
    mutationFn: async (q: string) => {
      const scope: Record<string, unknown> = {};
      if (channel) scope.channel_names = [channel];
      if (topic) scope.topics = [topic];
      if (person) scope.people = [person];

      try {
        return (await api.searchLibrary({
          query: q,
          mode,
          limit: 30,
          language: "en",
          scope: Object.keys(scope).length ? scope : undefined,
        })) as SearchResponse;
      } catch (err: unknown) {
        throw new Error(toErrorMessage(err, "search failed"));
      }
    },
  });

  useEffect(() => {
    if (didAutoSearch.current) return;
    if (!props.initialQuery) return;
    didAutoSearch.current = true;
    search.mutate(props.initialQuery);
  }, [props.initialQuery, search]);

  const groups = useMemo(() => {
    const hits = search.data?.hits || [];
    const byVideo = new Map<string, { meta: LibrarySearchHit; hits: LibrarySearchHit[] }>();
    for (const h of hits) {
      const g = byVideo.get(h.video_id);
      if (!g) byVideo.set(h.video_id, { meta: h, hits: [h] });
      else g.hits.push(h);
    }
    return Array.from(byVideo.values()).map((g) => ({
      video_id: g.meta.video_id,
      title: g.meta.title || g.meta.provider_video_id,
      provider_video_id: g.meta.provider_video_id,
      channel_name: g.meta.channel_name,
      thumbnail_url: g.meta.thumbnail_url,
      hits: g.hits.sort((a, b) => b.score - a.score),
    }));
  }, [search.data]);

  return (
    <div className="min-h-screen bg-[radial-gradient(900px_600px_at_10%_-10%,rgba(251,191,36,0.22),transparent_60%),radial-gradient(900px_600px_at_105%_10%,rgba(24,24,27,0.06),transparent_45%)]">
      <AppHeader />

      <div className="mx-auto max-w-6xl px-5 py-10">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Search</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
          Ask a question or drop a phrase. We&apos;ll search across your whole library (keyword, semantic, or hybrid) and
          take you straight to the moment in the transcript.
        </p>

        <form
          className="mt-6 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            const q = query.trim();
            if (!q) return;
            const sp = new URLSearchParams();
            sp.set("q", q);
            if (channel) sp.set("channel", channel);
            if (topic) sp.set("topic", topic);
            if (person) sp.set("person", person);
            router.replace(`/search?${sp.toString()}`);
            search.mutate(q);
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-amber-400"
            placeholder='e.g. "did Lex talk to the founder of OpenClaw?" or "Candace recommended a book"'
          />
          <div className="flex gap-2">
            <select
              value={mode}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "keyword" || v === "semantic" || v === "hybrid") setMode(v);
              }}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-3 text-sm"
              title="Search mode"
            >
              <option value="hybrid" disabled={!embeddingsOk}>
                Hybrid
              </option>
              <option value="semantic" disabled={!embeddingsOk}>
                Semantic
              </option>
              <option value="keyword">Keyword</option>
            </select>
            <button
              type="submit"
              className="rounded-xl bg-zinc-900 px-5 py-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
              disabled={search.isPending || !query.trim()}
            >
              {search.isPending ? "Searching..." : "Search"}
            </button>
          </div>
        </form>

        <div className="mt-4 grid gap-2 rounded-2xl border border-zinc-200 bg-white/70 p-4 backdrop-blur md:grid-cols-3">
          <div>
            <div className="text-[11px] font-semibold text-zinc-700">Channel</div>
            <select
              value={channel ?? ""}
              onChange={(e) => setChannel(e.target.value ? e.target.value : null)}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">All channels</option>
              {(channelsQ.data || []).map((c) => (
                <option key={c.channel_name} value={c.channel_name}>
                  {c.channel_name} ({c.videos})
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-zinc-700">Topic</div>
            <select
              value={topic ?? ""}
              onChange={(e) => setTopic(e.target.value ? e.target.value : null)}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">All topics</option>
              {(topicsQ.data || []).map((t) => (
                <option key={t.topic} value={t.topic}>
                  {t.topic} ({t.videos})
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-zinc-700">Person</div>
            <select
              value={person ?? ""}
              onChange={(e) => setPerson(e.target.value ? e.target.value : null)}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">All people</option>
              {(peopleQ.data || []).map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name} ({p.videos})
                </option>
              ))}
            </select>
          </div>
        </div>

        {search.data?.embedding_error && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            Semantic search degraded: {search.data.embedding_error}
          </div>
        )}

        {!embeddingsOk && (mode === "hybrid" || mode === "semantic") && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            Embeddings are disabled; semantic/hybrid won&apos;t work. Switch to keyword.
            {capsQ.data?.embeddings.reason ? ` (${capsQ.data.embeddings.reason})` : ""}
          </div>
        )}

        {search.isError && (
          <div className="mt-4">
            <ErrorWithRetry
              message={`Search failed: ${String(search.error?.message || "")}`}
              onRetry={() => { const q = query.trim(); if (q) search.mutate(q); }}
              isRetrying={search.isPending}
            />
          </div>
        )}

        {!search.isPending && !search.isError && search.data && search.data.hits.length === 0 && (
          <div className="mt-6 text-sm text-zinc-500">No results.</div>
        )}

        <div className="mt-6 flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g.video_id} className="rounded-2xl border border-zinc-200 bg-white/70 backdrop-blur">
              <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="h-12 w-20 shrink-0 overflow-hidden rounded-xl bg-zinc-100">
                    {g.thumbnail_url || g.provider_video_id ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={g.thumbnail_url || `https://i.ytimg.com/vi/${g.provider_video_id}/hqdefault.jpg`}
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
                    <div className="truncate text-sm font-semibold text-zinc-900">{g.title}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-mono">{g.provider_video_id}</span>
                      {g.channel_name && <span className="truncate">{g.channel_name}</span>}
                    </div>
                  </div>
                </div>
                <Link
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium hover:bg-zinc-50"
                  href={`/videos/${g.video_id}`}
                >
                  Open
                </Link>
              </div>

              <div className="divide-y divide-zinc-200">
                {g.hits.slice(0, 8).map((h) => (
                  <Link
                    key={`${h.video_id}:${h.cue_id}:${h.score}`}
                    className="block px-4 py-3 hover:bg-amber-50"
                    href={`/videos/${h.video_id}?at_ms=${h.start_ms}&cue_id=${h.cue_id}`}
                    title="Open at timestamp"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-medium tabular-nums text-zinc-700">{formatHms(h.start_ms)}</div>
                      <div className="text-xs tabular-nums text-zinc-500">{h.score.toFixed(2)}</div>
                    </div>
                    <div className="mt-1 text-sm text-zinc-900">{h.snippet}</div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
