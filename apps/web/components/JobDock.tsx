"use client";

import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import type { Job } from "@yt/contracts";
import { JobInspectDrawer } from "@/components/JobInspectDrawer";
import { getApiClient } from "@/lib/api_client";

function shortId(id: string): string {
  if (id.length <= 10) return id;
  return `${id.slice(0, 8)}...${id.slice(-4)}`;
}

function isTerminal(status: string | undefined): boolean {
  return status === "completed" || status === "failed" || status === "canceled";
}

export function JobDock(props: {
  jobId: string | null;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onDismiss?: () => void;
  title?: string;
}) {
  const api = getApiClient();
  const { jobId, open, onOpen, onClose, onDismiss, title } = props;

  const jobQ = useQuery({
    enabled: Boolean(jobId),
    queryKey: ["job", jobId],
    queryFn: async () => (await api.getJob(jobId!)).job as Job,
    refetchInterval: (q) => {
      const status = (q.state.data as Job | undefined)?.status;
      return isTerminal(status) ? false : 1000;
    },
  });

  if (!jobId) return null;

  const job = jobQ.data;
  const status = job?.status ?? (jobQ.isPending ? "starting" : "unknown");
  const progress = Math.max(0, Math.min(100, job?.progress ?? 0));
  const canDismiss = Boolean(onDismiss) && (isTerminal(job?.status) || jobQ.isError);

  const label = title || (job?.type === "ingest_video" ? "Ingest" : "Job");

  return (
    <>
      {!open && (
        <div className="fixed bottom-4 right-4 z-40 w-[min(420px,calc(100vw-2rem))]">
          <div
            className={clsx(
              "w-full cursor-pointer rounded-2xl border bg-white/90 p-4 text-left shadow-lg backdrop-blur transition hover:bg-white",
              status === "failed" ? "border-red-200" : "border-zinc-200"
            )}
            role="button"
            tabIndex={0}
            onClick={onOpen}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onOpen();
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-zinc-900">
                  {label}: {status}
                  {status === "running" || status === "queued" ? ` (${progress}%)` : ""}
                </div>
                <div className="mt-1 truncate text-[11px] text-zinc-600">
                  {shortId(jobId)}
                  {job?.error ? ` · ${job.error}` : ""}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen();
                  }}
                  aria-label="Open job inspector"
                >
                  Inspect
                </button>
                {canDismiss ? (
                  <button
                    type="button"
                    className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDismiss?.();
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

            {jobQ.isError ? (
              <div className="mt-2 text-[11px] text-red-700">Failed to load job status.</div>
            ) : null}
          </div>
        </div>
      )}

      <JobInspectDrawer open={open} jobId={jobId} onClose={onClose} />
    </>
  );
}
