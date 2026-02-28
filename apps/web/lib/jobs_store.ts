"use client";

import { create } from "zustand";

const STORAGE_KEY = "yit:jobs:v1";

type JobsState = {
  jobs: string[];
  dockOpen: boolean;
  inspectOpen: boolean;
  inspectJobId: string | null;

  rememberJob: (jobId: string, opts?: { openDock?: boolean; openInspector?: boolean }) => void;
  dismissJob: (jobId: string) => void;
  clearJobs: () => void;
  openInspector: (jobId: string) => void;
  closeInspector: () => void;
  setDockOpen: (open: boolean) => void;
};

function loadJobs(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((x) => String(x)).filter(Boolean).slice(0, 50);
  } catch {
    return [];
  }
}

function persistJobs(jobs: string[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs.slice(0, 50)));
  } catch {}
}

export const useJobsStore = create<JobsState>((set, get) => ({
  jobs: loadJobs(),
  dockOpen: false,
  inspectOpen: false,
  inspectJobId: null,

  rememberJob: (jobId, opts) => {
    const id = String(jobId || "").trim();
    if (!id) return;
    const cur = get().jobs;
    const next = [id].concat(cur.filter((x) => x !== id)).slice(0, 50);
    persistJobs(next);
    set({
      jobs: next,
      dockOpen: opts?.openDock ?? get().dockOpen,
      inspectOpen: opts?.openInspector ? true : get().inspectOpen,
      inspectJobId: opts?.openInspector ? id : get().inspectJobId,
    });
  },

  dismissJob: (jobId) => {
    const id = String(jobId || "").trim();
    const next = get().jobs.filter((x) => x !== id);
    persistJobs(next);
    const closingInspector = get().inspectJobId === id;
    set({
      jobs: next,
      inspectOpen: closingInspector ? false : get().inspectOpen,
      inspectJobId: closingInspector ? null : get().inspectJobId,
    });
  },

  clearJobs: () => {
    persistJobs([]);
    set({ jobs: [], dockOpen: false, inspectOpen: false, inspectJobId: null });
  },

  openInspector: (jobId) => {
    const id = String(jobId || "").trim();
    if (!id) return;
    get().rememberJob(id); // ensures it’s in the list
    set({ inspectOpen: true, inspectJobId: id });
  },

  closeInspector: () => set({ inspectOpen: false }),

  setDockOpen: (open) => set({ dockOpen: open }),
}));

