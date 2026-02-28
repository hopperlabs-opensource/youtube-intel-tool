"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import type { Job, JobLog } from "@yt/contracts";

function shortId(id: string): string {
  if (id.length <= 10) return id;
  return `${id.slice(0, 8)}...${id.slice(-4)}`;
}

function safeJsonStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export function JobInspectDrawer(props: { open: boolean; jobId: string; onClose: () => void }) {
  const { open, jobId, onClose } = props;
  const [tab, setTab] = useState<"summary" | "logs" | "output">("summary");
  const [filter, setFilter] = useState("");
  const [refreshNonce, setRefreshNonce] = useState(0);

  const [job, setJob] = useState<Job | null>(null);
  const [logs, setLogs] = useState<JobLog[]>([]);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  function asObject(v: unknown): Record<string, unknown> | null {
    if (typeof v !== "object" || v === null) return null;
    return v as Record<string, unknown>;
  }

  // Live stream job status + logs.
  useEffect(() => {
    if (!open) return;
    if (!jobId) return;

    // Reset view state when switching inspected job.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setJob(null);
    setLogs([]);
    setStreamError(null);
    setConnected(true);

    const seen = new Set<string>();
    const es = new EventSource(`/api/jobs/${jobId}/stream?ts=${Date.now()}`);

    es.onmessage = (e) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(e.data);
      } catch {
        return;
      }
      const obj = asObject(parsed);
      if (!obj) return;

      const type = obj.type;
      if (type === "job" && obj.job) {
        try {
          setJob(obj.job as Job);
        } catch {}
      }
      if (type === "log" && obj.log) {
        const l = obj.log as JobLog;
        if (l && typeof l.id === "string" && !seen.has(l.id)) {
          seen.add(l.id);
          setLogs((prev) => prev.concat([l]));
        }
      }
      const errObj = asObject(obj.error);
      if (type === "error" && typeof errObj?.message === "string") {
        setStreamError(errObj.message);
        setConnected(false);
        try {
          es.close();
        } catch {}
      }
      if (type === "done") {
        setConnected(false);
        try {
          es.close();
        } catch {}
      }
    };

    es.onerror = () => {
      setConnected(false);
      setStreamError("stream disconnected");
      try {
        es.close();
      } catch {}
    };

    return () => {
      try {
        es.close();
      } catch {}
    };
  }, [open, jobId, refreshNonce]);

  const filteredLogs = useMemo(() => {
    const arr = logs || [];
    const f = filter.trim().toLowerCase();
    if (!f) return arr;
    return arr.filter((l) => {
      if (l.level.toLowerCase().includes(f)) return true;
      if (l.message.toLowerCase().includes(f)) return true;
      if (l.data_json != null) {
        const s = safeJsonStringify(l.data_json).toLowerCase();
        if (s.includes(f)) return true;
      }
      return false;
    });
  }, [logs, filter]);

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const status = job?.status ?? "loading";

  return (
    <div className="fixed inset-0 z-50">
      <button className="absolute inset-0 bg-black/30" onClick={onClose} aria-label="Close inspector" />

      <div className="absolute right-0 top-0 h-full w-[min(560px,92vw)] border-l border-zinc-200 bg-white shadow-2xl">
        <div className="flex h-14 items-center justify-between border-b border-zinc-200 px-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-zinc-900">Inspector</div>
            <div className="mt-0.5 text-xs text-zinc-600">
              Job {shortId(jobId)}{" "}
              <span
                className={clsx(
                  "ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium",
                  status === "completed" && "bg-emerald-100 text-emerald-800",
                  status === "failed" && "bg-red-100 text-red-800",
                  status === "running" && "bg-amber-100 text-amber-900",
                  status === "queued" && "bg-zinc-100 text-zinc-700",
                  status === "canceled" && "bg-zinc-100 text-zinc-700",
                  status === "loading" && "bg-zinc-100 text-zinc-700"
                )}
              >
                {status}
              </span>
              <span className="ml-2 text-[11px] text-zinc-500">{connected ? "live" : "idle"}</span>
            </div>
          </div>
          <button
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium hover:bg-zinc-50"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="flex border-b border-zinc-200">
          <button
            className={clsx("flex-1 px-3 py-2 text-xs font-medium", tab === "summary" ? "bg-amber-100" : "hover:bg-zinc-50")}
            onClick={() => setTab("summary")}
          >
            Summary
          </button>
          <button
            className={clsx("flex-1 px-3 py-2 text-xs font-medium", tab === "logs" ? "bg-amber-100" : "hover:bg-zinc-50")}
            onClick={() => setTab("logs")}
          >
            Logs
          </button>
          <button
            className={clsx("flex-1 px-3 py-2 text-xs font-medium", tab === "output" ? "bg-amber-100" : "hover:bg-zinc-50")}
            onClick={() => setTab("output")}
          >
            Output
          </button>
        </div>

        <div className="h-[calc(100%-56px-40px)] overflow-auto px-4 py-4">
          {!job && !streamError && tab !== "output" && <div className="text-sm text-zinc-500">Loading...</div>}
          {streamError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {streamError}
            </div>
          )}

          {tab === "summary" && job && (
            <div className="flex flex-col gap-3">
              <div className="rounded-xl border border-zinc-200 bg-white p-3">
                <div className="text-xs font-semibold text-zinc-700">Job</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-zinc-700">
                  <div className="text-zinc-500">Type</div>
                  <div className="font-medium">{job.type}</div>
                  <div className="text-zinc-500">Progress</div>
                  <div className="font-medium">{job.progress ?? 0}%</div>
                  <div className="text-zinc-500">Created</div>
                  <div className="font-medium">{job.created_at}</div>
                  <div className="text-zinc-500">Started</div>
                  <div className="font-medium">{job.started_at ?? "-"}</div>
                  <div className="text-zinc-500">Finished</div>
                  <div className="font-medium">{job.finished_at ?? "-"}</div>
                </div>
                {job.error && <div className="mt-3 text-xs text-red-700">Error: {job.error}</div>}
              </div>

              <div className="rounded-xl border border-zinc-200 bg-white p-3">
                <div className="text-xs font-semibold text-zinc-700">Input</div>
                <pre className="mt-2 overflow-auto rounded-lg bg-zinc-50 p-2 text-[11px] leading-5 text-zinc-800">
                  {safeJsonStringify(job.input_json)}
                </pre>
              </div>
            </div>
          )}

          {tab === "logs" && (
            <div>
              <div className="flex items-center gap-2">
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter logs (level/message/json)..."
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs outline-none focus:border-amber-400"
                />
                <button
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium hover:bg-zinc-50"
                  onClick={() => {
                    setRefreshNonce((n) => n + 1);
                  }}
                >
                  Refresh
                </button>
              </div>

              <div className="mt-3 flex flex-col gap-2">
                {filteredLogs.length === 0 && <div className="text-sm text-zinc-500">No logs.</div>}
                {filteredLogs.map((l) => (
                  <div key={l.id} className="rounded-xl border border-zinc-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                      <div className="font-mono">{l.ts}</div>
                      <div className="rounded-full bg-zinc-100 px-2 py-0.5 font-medium text-zinc-700">{l.level}</div>
                    </div>
                    <div className="mt-1 text-xs font-medium text-zinc-900">{l.message}</div>
                    {l.data_json != null && (
                      <pre className="mt-2 overflow-auto rounded-lg bg-zinc-50 p-2 text-[11px] leading-5 text-zinc-800">
                        {safeJsonStringify(l.data_json)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "output" && (
            <div className="rounded-xl border border-zinc-200 bg-white p-3">
              <div className="text-xs font-semibold text-zinc-700">Output</div>
              <pre className="mt-2 overflow-auto rounded-lg bg-zinc-50 p-2 text-[11px] leading-5 text-zinc-800">
                {safeJsonStringify(job?.output_json)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
