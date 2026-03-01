import type { FrameAnalysis } from "./analyze";

export interface FrameChunk {
  chunkIndex: number;
  startMs: number;
  endMs: number;
  text: string;
  tokenEstimate: number;
}

function formatHms(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Build semantic chunks from consecutive frame analyses.
 * Mirrors the pattern of buildChunksFromCues in text/chunk.ts:
 * same maxChars=1800, minChars=400, overlap=1 defaults.
 *
 * Each analysis entry is formatted as:
 *   [HH:MM:SS] description
 */
export function buildChunksFromFrameAnalyses(
  analyses: FrameAnalysis[],
  opts?: {
    maxChars?: number;
    minChars?: number;
    overlap?: number;
  },
): FrameChunk[] {
  const maxChars = opts?.maxChars ?? 1800;
  const minChars = opts?.minChars ?? 400;
  const overlap = Math.max(0, opts?.overlap ?? 1);

  if (analyses.length === 0) return [];

  const chunks: FrameChunk[] = [];

  let startIdx = 0;
  let buf: string[] = [];
  let bufLen = 0;

  const flush = (endIdxInclusive: number) => {
    if (endIdxInclusive < startIdx) return;
    const text = buf.join("\n").trim();
    if (!text) return;
    chunks.push({
      chunkIndex: chunks.length,
      startMs: analyses[startIdx].startMs,
      endMs: analyses[endIdxInclusive].endMs,
      text,
      tokenEstimate: estimateTokens(text),
    });
  };

  for (let i = 0; i < analyses.length; i++) {
    const a = analyses[i];
    const line = `[${formatHms(a.timestampMs)}] ${a.description}`;
    const nextLen = bufLen + line.length + 1;
    const shouldCut = nextLen > maxChars && bufLen >= minChars;

    if (shouldCut) {
      flush(i - 1);

      // Overlap: move start back
      const newStartIdx = Math.max(0, i - overlap);
      startIdx = newStartIdx;
      buf = [];
      bufLen = 0;

      // Refill from overlap range
      for (let k = startIdx; k <= i; k++) {
        const al = analyses[k];
        const l = `[${formatHms(al.timestampMs)}] ${al.description}`;
        buf.push(l);
        bufLen += l.length + 1;
      }
      continue;
    }

    buf.push(line);
    bufLen = nextLen;
  }

  flush(analyses.length - 1);
  return chunks;
}
