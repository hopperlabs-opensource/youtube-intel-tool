"use client";

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import clsx from "clsx";
import type { Job } from "@yt/contracts";
import { useJobsStore } from "@/lib/jobs_store";
import { JobInspectDrawer } from "@/components/JobInspectDrawer";

function shortId(id: string): string {
  if (id.length <= 10) return id;
  return `${id.slice(0, 8)}...${id.slice(-4)}`;
}

function isTerminal(status: string | undefined): boolean {
  return status === "completed" || status === "failed" || status === "canceled";
}

export function JobCenter() {
  const jobs = useJobsStore((s) => s.jobs);
  const dockOpen = useJobsStore((s) => s.dockOpen);
  const setDockOpen = useJobsStore((s) => s.setDockOpen);
  const inspectOpen = useJobsStore((s) => s.inspectOpen);
  const inspectJobId = useJobsStore((s) => s.inspectJobId);
  const openInspector = useJobsStore((s) => s.openInspector);
  const closeInspector = useJobsStore((s) => s.closeInspector);
  const dismissJob = useJobsStore((s) => s.dismissJob);
  const clearJobs = useJobsStore((s) => s.clearJobs);

  const visibleIds = useMemo(() => jobs.slice(0, 12), [jobs]);

  const jobQs = useQueries({
    queries: visibleIds.map((jobId) => ({
      queryKey: ["job", jobId],
      queryFn: async () => {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) throw new Error(await res.text());
        const json = await res.json();
        return json.job as Job;
      },
      refetchInterval: (q) => {
        const status = (q.state.data as Job | undefined)?.status;
        return isTerminal(status) ? false : 1000;
      },
      retry: 0,
    })),
  });

  const byId = useMemo(() => {
    const m = new Map<string, Job>();
    for (const q of jobQs) {
      const j = q.data;
      if (j && typeof j.id === "string") m.set(j.id, j);
    }
    return m;
  }, [jobQs]);

  const activeIds = useMemo(() => {
    const out: string[] = [];
    for (const id of visibleIds) {
      const j = byId.get(id);
      if (!j) {
        // Unknown: keep for a bit so the user can inspect.
        out.push(id);
        continue;
      }
      if (!isTerminal(j.status)) out.push(id);
    }
    return out;
  }, [byId, visibleIds]);

  const primaryId = activeIds[0] || visibleIds[0] || null;
  const primaryJob = primaryId ? byId.get(primaryId) : null;

  if (!primaryId) return null;

  const status = primaryJob?.status ?? "starting";
  const progress = Math.max(0, Math.min(100, primaryJob?.progress ?? 0));
  const canDismiss = isTerminal(primaryJob?.status);

  return (
    <>
      {!dockOpen && (
        <div className="fixed bottom-4 right-4 z-40 w-[min(440px,calc(100vw-2rem))]">
          <div
            className={clsx(
              "w-full cursor-pointer rounded-2xl border bg-white/90 p-4 text-left shadow-lg backdrop-blur transition hover:bg-white",
              status === "failed" ? "border-red-200" : "border-zinc-200"
            )}
            role="button"
            tabIndex={0}
            onClick={() => setDockOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setDockOpen(true);
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-zinc-900">
                  Jobs: {status}
                  {!isTerminal(status) ? ` (${progress}%)` : ""}
                  {activeIds.length > 1 ? ` · +${activeIds.length - 1} active` : ""}
                </div>
                <div className="mt-1 truncate text-[11px] text-zinc-600">
                  {shortId(primaryId)}
                  {primaryJob?.error ? ` · ${primaryJob.error}` : ""}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    openInspector(primaryId);
                  }}
                >
                  Inspect
                </button>
                {canDismiss ? (
                  <button
                    type="button"
                    className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      dismissJob(primaryId);
                    }}
                  >
                    Dismiss
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-200">
              <div
                className={clsx("h-full rounded-full", status === "failed" ? "bg-red-500" : "bg-amber-500")}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {dockOpen && (
        <div className="fixed bottom-4 right-4 z-40 w-[min(560px,calc(100vw-2rem))]">
          <div className="rounded-2xl border border-zinc-200 bg-white/95 shadow-xl backdrop-blur">
            <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3">
              <div className="text-xs font-semibold text-zinc-900">
                Jobs {activeIds.length ? `(${activeIds.length} active)` : ""}
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50"
                  onClick={() => clearJobs()}
                  title="Clear all jobs from this dock"
                >
                  Clear
                </button>
                <button
                  className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50"
                  onClick={() => setDockOpen(false)}
                >
                  Minimize
                </button>
              </div>
            </div>

            <div className="max-h-[60vh] overflow-auto p-2">
              {visibleIds.map((id) => {
                const j = byId.get(id);
                const st = j?.status ?? "loading";
                const prog = Math.max(0, Math.min(100, j?.progress ?? 0));
                const dismissable = isTerminal(j?.status);
                return (
                  <div key={id} className="rounded-xl border border-zinc-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-zinc-900">
                          {j?.type || "job"}: {st}
                          {!isTerminal(st) ? ` (${prog}%)` : ""}
                        </div>
                        <div className="mt-1 truncate text-[11px] text-zinc-600">
                          {shortId(id)}
                          {j?.error ? ` · ${j.error}` : ""}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50"
                          onClick={() => openInspector(id)}
                        >
                          Inspect
                        </button>
                        {dismissable ? (
                          <button
                            className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50"
                            onClick={() => dismissJob(id)}
                          >
                            Dismiss
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-200">
                      <div
                        className={clsx("h-full rounded-full", st === "failed" ? "bg-red-500" : "bg-amber-500")}
                        style={{ width: `${prog}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {inspectOpen && inspectJobId ? <JobInspectDrawer open={inspectOpen} jobId={inspectJobId} onClose={closeInspector} /> : null}
    </>
  );
}
