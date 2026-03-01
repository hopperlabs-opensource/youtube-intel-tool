import http from "http";
import { Worker, QueueEvents } from "bullmq";
import { getYitDefault, getYitDefaultNumber, initMetrics, logger, QUEUE_NAME } from "@yt/core";
import { runIngestVideo } from "./jobs/ingest_video";
import { runIngestVisual } from "./jobs/ingest_visual";
import { runBuildDenseTranscript } from "./jobs/build_dense_transcript";
import { runDetectChapters } from "./jobs/detect_chapters";
import { runIngestFaces } from "./jobs/ingest_faces";
import { runIngestVoice } from "./jobs/ingest_voice";

const metrics = initMetrics();

const REDIS_URL = process.env.REDIS_URL || getYitDefault("REDIS_URL");
const METRICS_PORT = Number(
  process.env.METRICS_PORT || process.env.YIT_WORKER_METRICS_PORT || getYitDefaultNumber("YIT_WORKER_METRICS_PORT", 4010)
);

const parsedRedis = new URL(REDIS_URL);
const connection = {
  host: parsedRedis.hostname,
  port: parsedRedis.port ? Number(parsedRedis.port) : 6379,
  password: parsedRedis.password || undefined,
  db: parsedRedis.pathname && parsedRedis.pathname.length > 1 ? Number(parsedRedis.pathname.slice(1)) : undefined,
  maxRetriesPerRequest: null as any,
};
const queueEvents = new QueueEvents(QUEUE_NAME, { connection });

queueEvents.on("failed", ({ jobId, failedReason }) => {
  logger.error({ jobId, failedReason }, "Queue job failed");
});

queueEvents.on("completed", ({ jobId }) => {
  logger.info({ jobId }, "Queue job completed");
});

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const startedAt = Date.now();
    try {
      if (job.name === "ingest_video") {
        await runIngestVideo(String(job.id), job.data as any);
        metrics.jobsTotal.inc({ type: "ingest_video", status: "completed" });
        metrics.jobDurationMs.observe({ type: "ingest_video", status: "completed" }, Date.now() - startedAt);
        return { ok: true };
      }

      if (job.name === "ingest_visual") {
        await runIngestVisual(String(job.id), job.data as any);
        metrics.jobsTotal.inc({ type: "ingest_visual", status: "completed" });
        metrics.jobDurationMs.observe({ type: "ingest_visual", status: "completed" }, Date.now() - startedAt);
        return { ok: true };
      }

      if (job.name === "build_dense_transcript") {
        await runBuildDenseTranscript(String(job.id), job.data as any);
        metrics.jobsTotal.inc({ type: "build_dense_transcript", status: "completed" });
        metrics.jobDurationMs.observe({ type: "build_dense_transcript", status: "completed" }, Date.now() - startedAt);
        return { ok: true };
      }

      if (job.name === "detect_chapters") {
        await runDetectChapters(String(job.id), job.data as any);
        metrics.jobsTotal.inc({ type: "detect_chapters", status: "completed" });
        metrics.jobDurationMs.observe({ type: "detect_chapters", status: "completed" }, Date.now() - startedAt);
        return { ok: true };
      }

      if (job.name === "ingest_faces") {
        await runIngestFaces(String(job.id), job.data as any);
        metrics.jobsTotal.inc({ type: "ingest_faces", status: "completed" });
        metrics.jobDurationMs.observe({ type: "ingest_faces", status: "completed" }, Date.now() - startedAt);
        return { ok: true };
      }

      if (job.name === "ingest_voice") {
        await runIngestVoice(String(job.id), job.data as any);
        metrics.jobsTotal.inc({ type: "ingest_voice", status: "completed" });
        metrics.jobDurationMs.observe({ type: "ingest_voice", status: "completed" }, Date.now() - startedAt);
        return { ok: true };
      }

      metrics.jobsTotal.inc({ type: job.name, status: "failed" });
      metrics.jobDurationMs.observe({ type: job.name, status: "failed" }, Date.now() - startedAt);
      throw new Error(`Unknown job type: ${job.name}`);
    } catch (err: any) {
      metrics.jobsTotal.inc({ type: job.name, status: "failed" });
      metrics.jobDurationMs.observe({ type: job.name, status: "failed" }, Date.now() - startedAt);
      throw err;
    }
  },
  { connection }
);

worker.on("error", (err) => {
  logger.error({ err }, "Worker error");
});

const server = http.createServer(async (req, res) => {
  if (!req.url) return;

  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "yt-worker" }));
    return;
  }

  if (req.url === "/metrics") {
    res.writeHead(200, { "content-type": metrics.register.contentType });
    res.end(await metrics.register.metrics());
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
});

server.listen(METRICS_PORT, () => {
  logger.info({ port: METRICS_PORT }, "Worker metrics server listening");
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received, shutting down");
  await worker.close();
  await queueEvents.close();
  server.close();
  process.exit(0);
});
