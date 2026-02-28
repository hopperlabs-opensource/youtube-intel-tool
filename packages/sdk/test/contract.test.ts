import test from "node:test";
import assert from "node:assert/strict";
import { createYitClient, YitApiError } from "../src/client";

const BASE_URL = process.env.YIT_BASE_URL || "http://localhost:3333";
const api = createYitClient({ baseUrl: BASE_URL });

async function waitJob(jobId: string, opts?: { timeoutMs?: number; pollMs?: number }) {
  const timeoutMs = opts?.timeoutMs ?? 240_000;
  const pollMs = opts?.pollMs ?? 1_000;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { job } = await api.getJob(jobId);
    if (job.status === "completed") return job;
    if (job.status === "failed" || job.status === "canceled") {
      throw new Error(`job ${jobId} ${job.status}: ${job.error || "(no error)"}`);
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`job ${jobId} timed out after ${timeoutMs}ms`);
}

test("capabilities contract", async () => {
  const caps = await api.capabilities();
  assert.equal(typeof caps.embeddings.enabled, "boolean");
  assert.equal(typeof caps.tools.yt_dlp, "boolean");
});

test("library health contract", async () => {
  const health = await api.libraryHealth({ limit: 5 });
  assert.ok(Array.isArray(health.items));
});

test("end-to-end ingest -> query contracts", async () => {
  // Ensure we have at least one ingested video to test against.
  const url = process.env.YIT_CONTRACT_TEST_INGEST_URL || "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

  const { video } = await api.resolveVideo({ url });
  const { job } = await api.ingestVideo(video.id, { language: "en" });
  await waitJob(job.id);

  const transcripts = await api.listTranscripts(video.id);
  assert.ok(transcripts.transcripts.length >= 1);
  const transcriptId = transcripts.transcripts[0]!.id;

  const cues = await api.listCues(transcriptId, { cursor: 0, limit: 50 });
  assert.ok(cues.cues.length >= 1);

  const search = await api.searchVideo(video.id, { query: "never", mode: "keyword", limit: 5 });
  assert.ok(Array.isArray(search.hits));

  const ents = await api.listEntities(video.id);
  assert.ok(Array.isArray(ents.entities));

  const chat = await api.chat(video.id, {
    provider: "mock",
    language: "en",
    at_ms: 0,
    window_ms: 60_000,
    semantic_k: 0,
    keyword_k: 4,
    messages: [{ role: "user", content: "Summarize." }],
  });
  assert.ok(typeof chat.answer === "string");
});

test("library repair enqueues jobs", async () => {
  const vids = await api.listLibraryVideos({ limit: 1 });
  if (!vids.items.length) return;
  const v = vids.items[0]!.video;
  const out = await api.libraryRepair({ video_ids: [v.id], language: "en" });
  assert.equal(out.jobs.length, 1);
});

test("sdk error envelope", async () => {
  try {
    await api.getVideo("not-a-real-id");
    assert.fail("expected error");
  } catch (e: any) {
    assert.ok(e instanceof YitApiError);
    assert.ok(e.status >= 400);
  }
});

