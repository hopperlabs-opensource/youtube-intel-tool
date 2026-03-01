/**
 * Full end-to-end test exercising every SDK feature against a live server+worker.
 *
 * Requires:
 *   - docker compose up -d  (Postgres + Redis)
 *   - pnpm run db:migrate
 *   - pnpm --filter worker run dev
 *   - pnpm --filter web run dev
 *
 * Run:
 *   YIT_BASE_URL=http://localhost:48333 node --test packages/sdk/test/e2e-full.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createYitClient, YitApiError } from "../src/client.js";

const BASE_URL = process.env.YIT_BASE_URL || "http://localhost:48333";
const TEST_URL = process.env.YIT_E2E_VIDEO_URL || "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const api = createYitClient({ baseUrl: BASE_URL });

// ─── Helpers ────────────────────────────────────────────────────────────────

async function waitJob(jobId: string, opts?: { timeoutMs?: number; pollMs?: number }) {
  const timeoutMs = opts?.timeoutMs ?? 300_000;
  const pollMs = opts?.pollMs ?? 2_000;
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

// Shared state across sequential tests
let videoId: string;

// ─── 1. Resolve + Ingest ────────────────────────────────────────────────────

test("1. resolve + ingest video", async () => {
  const { video } = await api.resolveVideo({ url: TEST_URL });
  assert.ok(video.id, "video resolved with id");
  videoId = video.id;

  const { job } = await api.ingestVideo(videoId, { language: "en", steps: [] });
  assert.ok(job.id, "ingest job created");
  const finished = await waitJob(job.id);
  assert.equal(finished.status, "completed");
});

// ─── 2. Transcripts ─────────────────────────────────────────────────────────

test("2. transcripts — list + cues", async () => {
  const { transcripts } = await api.listTranscripts(videoId);
  assert.ok(transcripts.length >= 1, "at least one transcript");

  const tid = transcripts[0]!.id;
  const { cues } = await api.listCues(tid, { cursor: 0, limit: 25 });
  assert.ok(cues.length >= 1, "transcript has cues");

  const txt = await api.exportTranscript(tid, "txt");
  assert.ok(txt.length > 0, "export returns text");
});

// ─── 3. Search ──────────────────────────────────────────────────────────────

test("3. search — keyword", async () => {
  const result = await api.searchVideo(videoId, { query: "never", mode: "keyword", limit: 5 });
  assert.ok(Array.isArray(result.hits), "search returns hits array");
});

// ─── 4. Entities ────────────────────────────────────────────────────────────

test("4. entities", async () => {
  const { entities } = await api.listEntities(videoId);
  assert.ok(Array.isArray(entities), "entities is array");
});

// ─── 5. Chat ────────────────────────────────────────────────────────────────

test("5. chat", async () => {
  const result = await api.chat(videoId, {
    provider: "mock",
    language: "en",
    at_ms: 0,
    window_ms: 60_000,
    semantic_k: 0,
    keyword_k: 4,
    messages: [{ role: "user", content: "Summarize the video in one sentence." }],
  });
  assert.ok(typeof result.answer === "string", "chat returns answer");
});

// ─── 6. Speakers ────────────────────────────────────────────────────────────

test("6. speakers — list + segments", async () => {
  const { speakers } = await api.listVideoSpeakers(videoId);
  assert.ok(Array.isArray(speakers), "speakers is array");

  if (speakers.length > 0) {
    const segs = await api.listSpeakerSegments(videoId, { limit: 25 });
    assert.ok(Array.isArray(segs.segments), "segments is array");
  }
});

// ─── 7. Visual Ingest ───────────────────────────────────────────────────────

test("7. visual ingest", async () => {
  try {
    const { job } = await api.ingestVisual(videoId, {
      extraction: { strategy: "uniform", framesPerMinute: 1, maxFrames: 5 },
      vision: { provider: "claude", model: "claude-sonnet-4-20250514" },
      force: false,
    });
    assert.ok(job.id, "visual ingest job created");
    // Don't wait for completion — visual ingest needs a vision provider key
  } catch (e: any) {
    // Acceptable if provider is not configured
    if (e instanceof YitApiError) {
      console.log(`  [skip] visual ingest: ${e.message}`);
    } else {
      throw e;
    }
  }
});

// ─── 8. Dense Transcript ────────────────────────────────────────────────────

test("8. dense transcript — read", async () => {
  const dt = await api.getDenseTranscript(videoId);
  assert.ok(Array.isArray(dt.transcript.cues), "dense transcript has cues array");
  assert.equal(typeof dt.transcript.total_cues, "number");
});

// ─── 9. Auto-Chapters ──────────────────────────────────────────────────────

test("9. auto-chapters — read", async () => {
  const ac = await api.getAutoChapters(videoId);
  assert.ok(Array.isArray(ac.chapters), "auto-chapters has chapters");
  assert.ok(Array.isArray(ac.marks), "auto-chapters has marks");
});

// ─── 10. Significant Marks ─────────────────────────────────────────────────

test("10. significant marks", async () => {
  const result = await api.listSignificantMarks(videoId);
  assert.ok(Array.isArray(result.marks), "marks is array");
});

// ─── 11. Faces ──────────────────────────────────────────────────────────────

test("11. faces — ingest + list", async () => {
  // Ingest faces (may fail if no frames extracted — that's OK)
  try {
    const { job } = await api.ingestFaces(videoId, { force: true });
    assert.ok(job.id, "face ingest job created");
    try {
      await waitJob(job.id, { timeoutMs: 120_000 });
    } catch {
      console.log("  [note] face ingest job did not complete (may need visual ingest first)");
    }
  } catch (e: any) {
    console.log(`  [skip] face ingest: ${e.message}`);
  }

  // List identities
  const { identities } = await api.listFaceIdentities(videoId);
  assert.ok(Array.isArray(identities), "identities is array");

  if (identities.length > 0) {
    const id0 = identities[0]!;
    const appearances = await api.listFaceAppearances(videoId, id0.id);
    assert.ok(Array.isArray(appearances.appearances), "appearances is array");

    const detections = await api.listFaceDetections(videoId, { identityId: id0.id });
    assert.ok(Array.isArray(detections.detections), "detections is array");
  }
});

// ─── 12. Voice ──────────────────────────────────────────────────────────────

test("12. voice — ingest + info + match", async () => {
  // Ingest voice (may fail if no speakers or no Python deps)
  try {
    const { job } = await api.ingestVoice(videoId, { force: true });
    assert.ok(job.id, "voice ingest job created");
    try {
      await waitJob(job.id, { timeoutMs: 120_000 });
    } catch {
      console.log("  [note] voice ingest job did not complete (may need Python deps)");
    }
  } catch (e: any) {
    console.log(`  [skip] voice ingest: ${e.message}`);
  }

  // Speaker voice info
  const { speakers } = await api.listVideoSpeakers(videoId);
  if (speakers.length > 0) {
    const spk = speakers[0]!;

    try {
      const voice = await api.getSpeakerVoice(videoId, spk.id);
      // embedding may be null if voice ingest didn't complete
      assert.ok(voice.embedding === null || typeof voice.embedding === "object", "voice embedding shape OK");
    } catch (e: any) {
      console.log(`  [skip] getSpeakerVoice: ${e.message}`);
    }

    try {
      const match = await api.matchSpeaker(videoId, spk.id);
      assert.ok(Array.isArray(match.matches), "matches is array");
    } catch (e: any) {
      if (e instanceof YitApiError) {
        console.log(`  [skip] matchSpeaker: ${e.message}`);
      } else {
        throw e;
      }
    }
  }
});

// ─── 13. Global Speakers ────────────────────────────────────────────────────

test("13. global speakers — CRUD", async () => {
  // List
  const { global_speakers } = await api.listGlobalSpeakers();
  assert.ok(Array.isArray(global_speakers), "global_speakers is array");

  // Create
  const name = `e2e-test-speaker-${Date.now()}`;
  const created = await api.createGlobalSpeaker({ display_name: name });
  assert.ok(created.global_speaker.id, "created global speaker has id");
  assert.equal(created.global_speaker.display_name, name);

  // Get
  const fetched = await api.getGlobalSpeaker(created.global_speaker.id);
  assert.equal(fetched.global_speaker.display_name, name);

  // Update
  const newName = `${name}-updated`;
  const updated = await api.updateGlobalSpeaker(created.global_speaker.id, { display_name: newName });
  assert.equal(updated.global_speaker.display_name, newName);
});

// ─── 14. Policies ───────────────────────────────────────────────────────────

test("14. policies — create + run + hits + feed", async () => {
  const policy = await api.createPolicy({
    name: `e2e-policy-${Date.now()}`,
    description: "E2E test policy",
    enabled: true,
    search_payload: {
      query: "never",
      mode: "keyword",
      limit: 10,
      language: "en",
      scope: { video_ids: [videoId] },
    },
    priority_config: {
      weights: { recency: 0.2, relevance: 0.8, channel_boost: 0 },
      thresholds: { high: 0.01, medium: 0 },
    },
  });
  assert.ok(policy.policy.id, "policy created");

  const ran = await api.runPolicy(policy.policy.id, { triggered_by: "cli" });
  assert.equal(ran.run.policy_id, policy.policy.id);

  const runs = await api.listPolicyRuns(policy.policy.id, { limit: 5 });
  assert.ok(runs.runs.length >= 1, "at least one run");

  const hits = await api.listPolicyHits(policy.policy.id, { run_id: ran.run.id, limit: 25 });
  assert.ok(Array.isArray(hits.hits), "hits is array");

  if (policy.policy.feed_token) {
    const feed = await api.getPolicyFeedJson(policy.policy.id, policy.policy.feed_token);
    assert.equal(feed.policy.id, policy.policy.id);
  }
});

// ─── 15. Error Handling ─────────────────────────────────────────────────────

test("15. SDK error envelope", async () => {
  try {
    await api.getVideo("not-a-real-id");
    assert.fail("expected error");
  } catch (e: any) {
    assert.ok(e instanceof YitApiError, "error is YitApiError");
    assert.ok(e.status >= 400, "status >= 400");
  }
});
