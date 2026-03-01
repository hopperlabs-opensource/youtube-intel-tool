export interface FaceForClustering {
  detectionIndex: number;
  embedding: number[];
  det_score: number;
}

export interface FaceCluster {
  label: string;
  centroid: number[];
  members: number[];
  representative: number; // index of highest det_score member
}

/**
 * Cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error("Vector dimension mismatch");
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}

/**
 * Simple agglomerative clustering for face embeddings.
 * Uses cosine similarity with a threshold (default 0.68 for ArcFace 512d).
 */
export function clusterFaces(
  faces: FaceForClustering[],
  opts?: { threshold?: number },
): FaceCluster[] {
  const threshold = opts?.threshold ?? 0.68;

  if (faces.length === 0) return [];

  // Start with each face as its own cluster
  const clusters: Array<{
    members: number[];
    centroid: number[];
    bestScore: number;
    bestMember: number;
  }> = faces.map((f, i) => ({
    members: [i],
    centroid: [...f.embedding],
    bestScore: f.det_score,
    bestMember: i,
  }));

  // Agglomerative: merge closest clusters until no pair is above threshold
  let merged = true;
  while (merged) {
    merged = false;
    let bestI = -1;
    let bestJ = -1;
    let bestSim = -Infinity;

    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const sim = cosineSimilarity(clusters[i].centroid, clusters[j].centroid);
        if (sim > bestSim) {
          bestSim = sim;
          bestI = i;
          bestJ = j;
        }
      }
    }

    if (bestSim >= threshold && bestI >= 0 && bestJ >= 0) {
      // Merge cluster j into cluster i
      const ci = clusters[bestI];
      const cj = clusters[bestJ];

      const totalMembers = ci.members.length + cj.members.length;
      const newCentroid: number[] = [];
      for (let d = 0; d < ci.centroid.length; d++) {
        newCentroid.push(
          (ci.centroid[d] * ci.members.length + cj.centroid[d] * cj.members.length) / totalMembers,
        );
      }

      ci.members.push(...cj.members);
      ci.centroid = newCentroid;

      if (cj.bestScore > ci.bestScore) {
        ci.bestScore = cj.bestScore;
        ci.bestMember = cj.bestMember;
      }

      clusters.splice(bestJ, 1);
      merged = true;
    }
  }

  // Convert to FaceCluster[]
  return clusters.map((c, idx) => ({
    label: `face_${idx}`,
    centroid: c.centroid,
    members: c.members,
    representative: c.bestMember,
  }));
}
