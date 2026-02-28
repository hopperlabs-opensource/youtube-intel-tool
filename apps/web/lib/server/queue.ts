import { Queue } from "bullmq";
import { QUEUE_NAME } from "@yt/core";

declare global {
  var __yt_queue__: Queue | undefined;
}

export function getIngestQueue(): Queue {
  if (globalThis.__yt_queue__) return globalThis.__yt_queue__;

  const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:56379";
  const parsedRedis = new URL(redisUrl);
  const connection = {
    host: parsedRedis.hostname,
    port: parsedRedis.port ? Number(parsedRedis.port) : 6379,
    password: parsedRedis.password || undefined,
    db: parsedRedis.pathname && parsedRedis.pathname.length > 1 ? Number(parsedRedis.pathname.slice(1)) : undefined,
    maxRetriesPerRequest: null,
  };

  globalThis.__yt_queue__ = new Queue(QUEUE_NAME, { connection });
  return globalThis.__yt_queue__;
}
