import test from "node:test";
import assert from "node:assert/strict";

// Note: matchSpeakerAcrossVideos, createOrLinkGlobalSpeaker, and fuseFaceAndVoice
// require a real DB connection with pgvector. These tests validate the module loads
// correctly and test the parts that don't require a DB.

// Import to verify the module loads without errors
import { matchSpeakerAcrossVideos, createOrLinkGlobalSpeaker } from "../src/voices/match";
import { fuseFaceAndVoice } from "../src/voices/fusion";

// ─── Module load tests ───────────────────────────────────────────────────────

test("matchSpeakerAcrossVideos is a function", () => {
  assert.equal(typeof matchSpeakerAcrossVideos, "function");
});

test("createOrLinkGlobalSpeaker is a function", () => {
  assert.equal(typeof createOrLinkGlobalSpeaker, "function");
});

test("fuseFaceAndVoice is a function", () => {
  assert.equal(typeof fuseFaceAndVoice, "function");
});

// ─── cosineSimilarity integration with voice matching ────────────────────────

// We test cosine similarity from the faces module since voice matching uses the
// same math internally (via pgvector). This validates the logic even without DB.
import { cosineSimilarity } from "../src/faces/cluster";

test("voice embedding similarity: same speaker should be high", () => {
  // Simulated voice embeddings — same speaker with slight variations
  const speakerA1 = [0.5, 0.3, 0.8, 0.1, 0.4, 0.7, 0.2, 0.6];
  const speakerA2 = [0.51, 0.29, 0.81, 0.09, 0.41, 0.69, 0.21, 0.59];
  const sim = cosineSimilarity(speakerA1, speakerA2);
  assert.ok(sim > 0.99, `Expected high similarity for same speaker, got ${sim}`);
});

test("voice embedding similarity: different speakers should be lower", () => {
  const speakerA = [0.5, 0.3, 0.8, 0.1, 0.4, 0.7, 0.2, 0.6];
  const speakerB = [0.1, 0.9, 0.2, 0.8, 0.3, 0.1, 0.7, 0.4];
  const sim = cosineSimilarity(speakerA, speakerB);
  assert.ok(sim < 0.85, `Expected lower similarity for different speakers, got ${sim}`);
});

test("voice embedding threshold of 0.85 separates same vs different", () => {
  const threshold = 0.85;

  // Same speaker: high similarity
  const same1 = [0.5, 0.3, 0.8, 0.1, 0.4];
  const same2 = [0.52, 0.28, 0.82, 0.08, 0.42];
  assert.ok(cosineSimilarity(same1, same2) >= threshold);

  // Different speakers: low similarity
  const diff1 = [1, 0, 0, 0, 0];
  const diff2 = [0, 1, 0, 0, 0];
  assert.ok(cosineSimilarity(diff1, diff2) < threshold);
});

// ─── Mock DB client tests ────────────────────────────────────────────────────

test("createOrLinkGlobalSpeaker rejects without DB (validates call signature)", async () => {
  // Create a minimal mock that throws to verify the function attempts DB access
  const mockClient = {
    query: async () => { throw new Error("mock_db_not_available"); },
  } as any;

  await assert.rejects(
    () => createOrLinkGlobalSpeaker(mockClient, {
      displayName: "Test Speaker",
      speakerId: "00000000-0000-0000-0000-000000000001",
      videoId: "00000000-0000-0000-0000-000000000002",
    }),
    /mock_db_not_available/,
  );
});

test("matchSpeakerAcrossVideos rejects without DB (validates call signature)", async () => {
  const mockClient = {
    query: async () => { throw new Error("mock_db_not_available"); },
  } as any;

  await assert.rejects(
    () => matchSpeakerAcrossVideos(mockClient, "00000000-0000-0000-0000-000000000001"),
    /mock_db_not_available/,
  );
});

test("fuseFaceAndVoice rejects without DB (validates call signature)", async () => {
  const mockClient = {
    query: async () => { throw new Error("mock_db_not_available"); },
  } as any;

  await assert.rejects(
    () => fuseFaceAndVoice(mockClient, "00000000-0000-0000-0000-000000000001"),
    /mock_db_not_available/,
  );
});

// ─── createOrLinkGlobalSpeaker logic tests with mock DB ──────────────────────

test("createOrLinkGlobalSpeaker links to existing global speaker when ID provided", async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const mockClient = {
    query: async (text: string, values: unknown[]) => {
      queries.push({ text, values });
      // Simulate link insert response
      return { rows: [{ id: "link-id-1" }] };
    },
  } as any;

  const result = await createOrLinkGlobalSpeaker(mockClient, {
    displayName: "Test Speaker",
    speakerId: "speaker-1",
    videoId: "video-1",
    existingGlobalSpeakerId: "global-speaker-1",
    confidence: 0.92,
  });

  assert.equal(result.globalSpeakerId, "global-speaker-1");
  assert.equal(result.linkId, "link-id-1");
  // Should NOT have created a new global speaker (no INSERT INTO global_speakers)
  const createdGlobal = queries.some((q) => q.text.includes("INSERT INTO global_speakers"));
  assert.equal(createdGlobal, false);
});

test("createOrLinkGlobalSpeaker creates new global speaker when no ID provided", async () => {
  let queryCount = 0;
  const mockClient = {
    query: async (text: string, _values: unknown[]) => {
      queryCount++;
      if (text.includes("speaker_embeddings")) {
        // First query: look up embedding
        return { rows: [] };
      }
      if (text.includes("INSERT INTO global_speakers")) {
        return { rows: [{ id: "new-global-id" }] };
      }
      if (text.includes("INSERT INTO global_speaker_links")) {
        return { rows: [{ id: "new-link-id" }] };
      }
      return { rows: [] };
    },
  } as any;

  const result = await createOrLinkGlobalSpeaker(mockClient, {
    displayName: "New Speaker",
    speakerId: "speaker-2",
    videoId: "video-2",
  });

  assert.equal(result.globalSpeakerId, "new-global-id");
  assert.equal(result.linkId, "new-link-id");
  assert.ok(queryCount >= 2); // At least embedding lookup + global speaker insert + link insert
});
