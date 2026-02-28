import client from "prom-client";

export type Metrics = {
  register: client.Registry;
  httpRequestsTotal: client.Counter<"route" | "method" | "status">;
  jobsTotal: client.Counter<"type" | "status">;
  jobDurationMs: client.Histogram<"type" | "status">;
  chatRequestsTotal: client.Counter<"provider" | "status">;
  chatDurationMs: client.Histogram<"provider" | "status">;
};

declare global {
  var __yt_metrics__: Metrics | undefined;
}

export function initMetrics(): Metrics {
  if (globalThis.__yt_metrics__) return globalThis.__yt_metrics__;

  const register = new client.Registry();
  client.collectDefaultMetrics({ register });

  const httpRequestsTotal = new client.Counter({
    name: "yt_http_requests_total",
    help: "Total HTTP requests",
    labelNames: ["route", "method", "status"] as const,
    registers: [register],
  });

  const jobsTotal = new client.Counter({
    name: "yt_jobs_total",
    help: "Jobs processed",
    labelNames: ["type", "status"] as const,
    registers: [register],
  });

  const jobDurationMs = new client.Histogram({
    name: "yt_job_duration_ms",
    help: "Job duration in ms",
    labelNames: ["type", "status"] as const,
    buckets: [50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 30_000, 60_000, 120_000],
    registers: [register],
  });

  const chatRequestsTotal = new client.Counter({
    name: "yt_chat_requests_total",
    help: "Chat requests",
    labelNames: ["provider", "status"] as const,
    registers: [register],
  });

  const chatDurationMs = new client.Histogram({
    name: "yt_chat_duration_ms",
    help: "Chat request duration in ms",
    labelNames: ["provider", "status"] as const,
    buckets: [50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 20_000, 40_000, 60_000, 120_000],
    registers: [register],
  });

  const m = { register, httpRequestsTotal, jobsTotal, jobDurationMs, chatRequestsTotal, chatDurationMs };
  globalThis.__yt_metrics__ = m;
  return m;
}
