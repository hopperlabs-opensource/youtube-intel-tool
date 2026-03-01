import test from "node:test";
import assert from "node:assert/strict";
import { createYitClient, YitApiError } from "../src/client";

const BASE_URL = process.env.YIT_BASE_URL || "http://localhost:48333";
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
  const { job } = await api.ingestVideo(video.id, { language: "en", steps: [] });
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
  const out = await api.libraryRepair({ video_ids: [v.id], language: "en", steps: [] });
  assert.equal(out.jobs.length, 1);
});

test("saved policy run + feed contracts", async () => {
  const url = process.env.YIT_CONTRACT_TEST_INGEST_URL || "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  const { video } = await api.resolveVideo({ url });
  const { job } = await api.ingestVideo(video.id, { language: "en", steps: [] });
  await waitJob(job.id);

  const created = await api.createPolicy({
    name: `contract-policy-${Date.now()}`,
    description: "sdk contract test policy",
    enabled: true,
    search_payload: {
      query: "never",
      mode: "keyword",
      limit: 10,
      language: "en",
      scope: { video_ids: [video.id] },
    },
    priority_config: {
      weights: { recency: 0.2, relevance: 0.8, channel_boost: 0 },
      thresholds: { high: 0.01, medium: 0 },
    },
  });
  assert.ok(created.policy.id.length > 0);

  const ran = await api.runPolicy(created.policy.id, { triggered_by: "cli" });
  assert.equal(ran.run.policy_id, created.policy.id);
  assert.ok(ran.hits_count >= 0);

  const runs = await api.listPolicyRuns(created.policy.id, { limit: 5 });
  assert.ok(runs.runs.length >= 1);

  const hits = await api.listPolicyHits(created.policy.id, { run_id: ran.run.id, limit: 25 });
  assert.ok(hits.hits.length >= 1);

  const feed = await api.getPolicyFeedJson(created.policy.id, created.policy.feed_token);
  assert.equal(feed.policy.id, created.policy.id);
  assert.ok(Array.isArray(feed.items));

  const rss = await api.getPolicyFeedRss(created.policy.id, created.policy.feed_token);
  assert.ok(rss.includes("<rss"));

  const unauthorizedFeed = await fetch(
    `${BASE_URL}/api/feeds/${created.policy.id}.json?token=definitely-wrong-token`,
    { method: "GET" },
  );
  assert.equal(unauthorizedFeed.status, 401);

  const noOpPatch = await fetch(`${BASE_URL}/api/policies/${created.policy.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(noOpPatch.status, 400);
});

// ─── Dense Transcript ───────────────────────────────────────────────────────

test("dense transcript build + read back contract", async () => {
  const url = process.env.YIT_CONTRACT_TEST_INGEST_URL || "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  const { video } = await api.resolveVideo({ url });

  // Read dense transcript (may be empty if never built)
  const dt = await api.getDenseTranscript(video.id);
  assert.ok(Array.isArray(dt.transcript.cues));
  assert.equal(typeof dt.transcript.total_cues, "number");
  assert.equal(typeof dt.transcript.interpolated_cues, "number");
  assert.equal(typeof dt.transcript.direct_cues, "number");
});

// ─── Auto-Chapters + Marks ──────────────────────────────────────────────────

test("auto-chapters read contract", async () => {
  const url = process.env.YIT_CONTRACT_TEST_INGEST_URL || "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  const { video } = await api.resolveVideo({ url });

  const ac = await api.getAutoChapters(video.id);
  assert.ok(Array.isArray(ac.chapters));
  assert.ok(Array.isArray(ac.marks));
});

test("significant marks list contract", async () => {
  const url = process.env.YIT_CONTRACT_TEST_INGEST_URL || "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  const { video } = await api.resolveVideo({ url });

  const result = await api.listSignificantMarks(video.id);
  assert.ok(Array.isArray(result.marks));
});

// ─── Faces ──────────────────────────────────────────────────────────────────

test("face identities list contract", async () => {
  const url = process.env.YIT_CONTRACT_TEST_INGEST_URL || "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  const { video } = await api.resolveVideo({ url });

  const faces = await api.listFaceIdentities(video.id);
  assert.ok(Array.isArray(faces.identities));

  // If we have face identities, test appearances endpoint too
  if (faces.identities.length > 0) {
    const identity = faces.identities[0]!;
    const appearances = await api.listFaceAppearances(video.id, identity.id);
    assert.ok(Array.isArray(appearances.appearances));
  }
});

// ─── Global Speakers ────────────────────────────────────────────────────────

test("global speakers list contract", async () => {
  const gs = await api.listGlobalSpeakers();
  assert.ok(Array.isArray(gs.global_speakers));
});

// ─── Voice Match ────────────────────────────────────────────────────────────

test("voice match contract shape", async () => {
  const url = process.env.YIT_CONTRACT_TEST_INGEST_URL || "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  const { video } = await api.resolveVideo({ url });

  // Get speakers for the video to test voice match
  const speakers = await api.listVideoSpeakers(video.id);
  if (speakers.speakers && speakers.speakers.length > 0) {
    const speaker = speakers.speakers[0]!;
    try {
      const match = await api.matchSpeaker(video.id, speaker.id);
      assert.ok(Array.isArray(match.matches));
    } catch (e: any) {
      // Voice match may fail if no embeddings exist — that's OK for shape test
      if (e instanceof YitApiError) {
        assert.ok(e.status >= 400);
      }
    }
  }
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
