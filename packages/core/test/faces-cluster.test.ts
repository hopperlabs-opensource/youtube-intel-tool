import test from "node:test";
import assert from "node:assert/strict";
import { cosineSimilarity, clusterFaces, type FaceForClustering } from "../src/faces/cluster";

// ─── cosineSimilarity ─────────────────────────────────────────────────────────

test("cosineSimilarity of identical vectors is 1", () => {
  const v = [1, 2, 3, 4, 5];
  assert.equal(cosineSimilarity(v, v), 1);
});

test("cosineSimilarity of orthogonal vectors is 0", () => {
  const a = [1, 0, 0];
  const b = [0, 1, 0];
  assert.equal(cosineSimilarity(a, b), 0);
});

test("cosineSimilarity of opposite vectors is -1", () => {
  const a = [1, 0, 0];
  const b = [-1, 0, 0];
  assert.equal(cosineSimilarity(a, b), -1);
});

test("cosineSimilarity with known vectors", () => {
  const a = [1, 2, 3];
  const b = [4, 5, 6];
  // cos = (4+10+18) / (sqrt(14) * sqrt(77)) = 32 / sqrt(1078)
  const expected = 32 / Math.sqrt(14 * 77);
  assert.ok(Math.abs(cosineSimilarity(a, b) - expected) < 1e-10);
});

test("cosineSimilarity throws on dimension mismatch", () => {
  assert.throws(() => cosineSimilarity([1, 2], [1, 2, 3]), /dimension mismatch/i);
});

test("cosineSimilarity of zero vector is 0", () => {
  assert.equal(cosineSimilarity([0, 0, 0], [1, 2, 3]), 0);
});

// ─── clusterFaces ─────────────────────────────────────────────────────────────

function makeFace(embedding: number[], score: number, idx: number): FaceForClustering {
  return { detectionIndex: idx, embedding, det_score: score };
}

test("clusterFaces with empty input returns empty", () => {
  assert.deepEqual(clusterFaces([]), []);
});

test("clusterFaces with single face returns one cluster", () => {
  const faces = [makeFace([1, 0, 0], 0.9, 0)];
  const clusters = clusterFaces(faces);
  assert.equal(clusters.length, 1);
  assert.deepEqual(clusters[0].members, [0]);
  assert.equal(clusters[0].representative, 0);
});

test("clusterFaces groups identical embeddings into one cluster", () => {
  const embedding = [0.5, 0.3, 0.8, 0.1, 0.9];
  const faces = Array.from({ length: 5 }, (_, i) =>
    makeFace([...embedding], 0.5 + i * 0.1, i),
  );
  const clusters = clusterFaces(faces);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].members.length, 5);
  // Representative should be the one with highest det_score (index 4, score 0.9)
  assert.equal(clusters[0].representative, 4);
});

test("clusterFaces separates 3 distinct clusters", () => {
  // Create 3 clusters with orthogonal-ish embeddings
  const cluster1 = Array.from({ length: 5 }, (_, i) =>
    makeFace([1, 0.01 * i, 0, 0], 0.8, i),
  );
  const cluster2 = Array.from({ length: 5 }, (_, i) =>
    makeFace([0, 1, 0.01 * i, 0], 0.7, 5 + i),
  );
  const cluster3 = Array.from({ length: 5 }, (_, i) =>
    makeFace([0, 0, 1, 0.01 * i], 0.6, 10 + i),
  );

  const clusters = clusterFaces([...cluster1, ...cluster2, ...cluster3]);
  assert.equal(clusters.length, 3);

  // Each cluster should have 5 members
  const memberCounts = clusters.map((c) => c.members.length).sort();
  assert.deepEqual(memberCounts, [5, 5, 5]);
});

test("clusterFaces respects threshold: low threshold merges more", () => {
  // Slightly different vectors
  const faces = [
    makeFace([1, 0, 0], 0.9, 0),
    makeFace([0.9, 0.1, 0], 0.8, 1),
    makeFace([0.8, 0.2, 0], 0.7, 2),
  ];

  // With very low threshold, everything merges
  const lowThreshold = clusterFaces(faces, { threshold: 0.5 });
  // With high threshold, may split
  const highThreshold = clusterFaces(faces, { threshold: 0.99 });

  assert.ok(lowThreshold.length <= highThreshold.length);
});

test("clusterFaces with all different embeddings keeps them separate at high threshold", () => {
  const faces = [
    makeFace([1, 0, 0, 0], 0.9, 0),
    makeFace([0, 1, 0, 0], 0.8, 1),
    makeFace([0, 0, 1, 0], 0.7, 2),
    makeFace([0, 0, 0, 1], 0.6, 3),
  ];
  const clusters = clusterFaces(faces, { threshold: 0.9 });
  assert.equal(clusters.length, 4);
});

test("clusterFaces representative is highest det_score per cluster", () => {
  const faces = [
    makeFace([1, 0, 0], 0.3, 0),
    makeFace([1, 0, 0], 0.95, 1),
    makeFace([1, 0, 0], 0.5, 2),
  ];
  const clusters = clusterFaces(faces);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].representative, 1); // highest det_score
});
