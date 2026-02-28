"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import type { CapabilitiesResponse, Job, LibraryHealthItem, LibraryHealthResponse } from "@yt/contracts";
import { useJobsStore } from "@/lib/jobs_store";
import { getApiClient, toErrorMessage } from "@/lib/api_client";

function isBroken(it: LibraryHealthItem, caps: CapabilitiesResponse | null): { broken: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!it.latest_transcript) reasons.push("no transcript");
  if (it.latest_transcript && (it.cues ?? 0) === 0) reasons.push("no cues");

  const embeddingsEnabled = Boolean(caps?.embeddings.enabled) && Boolean((caps?.embeddings.model_id || "").trim());
  if (embeddingsEnabled) {
    if (it.latest_transcript && (it.chunks ?? 0) > 0 && (it.embeddings ?? 0) === 0) reasons.push("no embeddings");
  }

  if ((it.entities ?? 0) === 0) reasons.push("no entities");
  if ((it.context_items ?? 0) === 0) reasons.push("no context");

  return { broken: reasons.length > 0, reasons };
}

export default function LibraryRepairPage() {
  const api = getApiClient();
  const [filter, setFilter] = useState<"all" | "broken">("broken");
  const [cliEnrich, setCliEnrich] = useState(true);
  const [diarize, setDiarize] = useState(false);
  const [stt, setStt] = useState(true);
  const rememberJob = useJobsStore((s) => s.rememberJob);

  const capsQ = useQuery({
    queryKey: ["capabilities"],
    queryFn: async () => (await api.capabilities()) as CapabilitiesResponse,
    staleTime: 30_000,
  });

  const healthQ = useQuery({
    queryKey: ["libraryHealth"],
    queryFn: async () => (await api.libraryHealth({ limit: 500 })) as LibraryHealthResponse,
  });

  const items = useMemo(() => {
    const caps = capsQ.data ?? null;
    const arr = healthQ.data?.items || [];
    if (filter === "all") return arr;
    return arr.filter((it) => isBroken(it, caps).broken);
  }, [capsQ.data, filter, healthQ.data?.items]);

  const brokenCount = useMemo(() => {
    const caps = capsQ.data ?? null;
    const arr = healthQ.data?.items || [];
    return arr.filter((it) => isBroken(it, caps).broken).length;
  }, [capsQ.data, healthQ.data?.items]);

  const repair = useMutation({
    mutationFn: async (videoIds: string[]) => {
      const steps: string[] = [];
      if (cliEnrich) steps.push("enrich_cli");
      if (diarize) steps.push("diarize");
      if (stt) steps.push("stt");
      try {
        const out = await api.libraryRepair({ video_ids: videoIds, language: "en", steps });
        return out.jobs as Job[];
      } catch (err: unknown) {
        throw new Error(toErrorMessage(err, "repair failed"));
      }
    },
    onSuccess: (jobs) => {
      const first = jobs[0];
      if (first) {
        rememberJob(first.id, { openDock: true, openInspector: true });
      }
      void healthQ.refetch();
    },
  });

  const caps = capsQ.data ?? null;
  const embeddingsOk = Boolean(caps?.embeddings.enabled);
  const sttOk = Boolean(caps?.stt.enabled);
  const diarizeOk = Boolean(caps?.diarization.enabled);

  return (
    <div>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-zinc-600">
            {healthQ.data?.items?.length ?? 0} videos
            {filter === "broken" ? ` · ${brokenCount} need repair` : ""}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className={`rounded-xl border px-3 py-2 text-xs font-medium ${filter === "broken" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"}`}
              onClick={() => setFilter("broken")}
            >
              Broken
            </button>
            <button
              className={`rounded-xl border px-3 py-2 text-xs font-medium ${filter === "all" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"}`}
              onClick={() => setFilter("all")}
            >
              All
            </button>
            <button
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium hover:bg-zinc-50"
              onClick={() => healthQ.refetch()}
            >
              Refresh
            </button>
          </div>
        </div>

        {(capsQ.isError || healthQ.isError) && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {String(capsQ.error?.message || healthQ.error?.message || "Failed to load")}
          </div>
        )}

        {caps && (
          <div className="rounded-2xl border border-zinc-200 bg-white/70 p-4 text-xs text-zinc-700 backdrop-blur">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                Embeddings:{" "}
                <span className={embeddingsOk ? "text-emerald-700" : "text-amber-800"}>
                  {embeddingsOk ? `on (${caps.embeddings.provider}/${caps.embeddings.model_id})` : `off (${caps.embeddings.reason})`}
                </span>
              </div>
              <div>
                STT:{" "}
                <span className={sttOk ? "text-emerald-700" : "text-amber-800"}>
                  {sttOk ? `on (${caps.stt.provider}/${caps.stt.model_id})` : `off (${caps.stt.reason})`}
                </span>
              </div>
              <div>
                Diarization:{" "}
                <span className={diarizeOk ? "text-emerald-700" : "text-amber-800"}>
                  {diarizeOk ? `on (${caps.diarization.backend})` : `off (${caps.diarization.reason})`}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-3 text-xs text-zinc-700">
            <input type="checkbox" checked={cliEnrich} onChange={(e) => setCliEnrich(e.target.checked)} />
            CLI enrich
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-3 text-xs text-zinc-700">
            <input type="checkbox" checked={stt} onChange={(e) => setStt(e.target.checked)} />
            STT fallback
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-3 text-xs text-zinc-700">
            <input type="checkbox" checked={diarize} onChange={(e) => setDiarize(e.target.checked)} />
            Diarize
          </label>

          <button
            className="rounded-xl bg-zinc-900 px-4 py-3 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
            disabled={repair.isPending || !items.length}
            onClick={() => repair.mutate(items.map((x) => x.video.id))}
            title="Enqueue ingest for the current list (broken/all)"
          >
            {repair.isPending ? "Enqueueing..." : filter === "broken" ? `Repair ${items.length}` : `Re-ingest ${items.length}`}
          </button>

          {repair.isError && <div className="text-xs text-red-600">Repair failed: {String(repair.error?.message || "")}</div>}
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-200 bg-white/70 backdrop-blur">
        <div className="border-b border-zinc-200 px-4 py-3 text-xs font-medium text-zinc-600">
          Repair Queue
          {healthQ.data?.embeddings_model_id ? ` · embeddings model ${healthQ.data.embeddings_model_id}` : ""}
        </div>

        {healthQ.isPending && <div className="p-4 text-sm text-zinc-500">Loading...</div>}
        {!healthQ.isPending && !healthQ.isError && items.length === 0 && (
          <div className="p-4 text-sm text-zinc-500">Nothing to repair.</div>
        )}

        <div className="divide-y divide-zinc-200">
          {items.map((it) => {
            const v = it.video;
            const t = it.latest_transcript;
            const r = isBroken(it, caps);
            return (
              <div key={v.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="truncate text-sm font-medium text-zinc-900">{v.title || v.provider_video_id}</div>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-mono text-[11px] text-zinc-700">
                      {v.provider_video_id}
                    </span>
                    {v.channel_name && <span className="truncate text-xs text-zinc-600">{v.channel_name}</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-600">
                    <span className={t ? "text-emerald-700" : "text-amber-800"}>
                      {t ? `Transcript: ${t.language}/${t.source}` : "No transcript"}
                    </span>
                    <span>Cues: {it.cues ?? "-"}</span>
                    <span>Chunks: {it.chunks ?? "-"}</span>
                    <span>Emb: {it.embeddings ?? "-"}</span>
                    <span>Ent: {it.entities ?? 0}</span>
                    <span>Ctx: {it.context_items ?? 0}</span>
                    {r.broken && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900">
                        {r.reasons.join(", ")}
                      </span>
                    )}
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
                    disabled={repair.isPending}
                    onClick={() => repair.mutate([v.id])}
                    title="Enqueue ingest for this video"
                  >
                    Repair
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
