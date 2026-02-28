import type { TranscriptCue } from "@yt/contracts";

export type TranscriptChunk = {
  cue_start_idx: number;
  cue_end_idx: number;
  start_ms: number;
  end_ms: number;
  text: string;
  token_estimate: number;
};

function estimateTokens(text: string): number {
  // Rough heuristic used for chunk sizing. Good enough for embedding/query windows.
  return Math.max(1, Math.ceil(text.length / 4));
}

export function buildChunksFromCues(
  cues: TranscriptCue[],
  opts?: {
    maxChars?: number;
    minChars?: number;
    overlapCues?: number;
  }
): TranscriptChunk[] {
  const maxChars = opts?.maxChars ?? 1800;
  const minChars = opts?.minChars ?? 400;
  const overlapCues = Math.max(0, opts?.overlapCues ?? 1);

  if (cues.length === 0) return [];

  const chunks: TranscriptChunk[] = [];

  let startIdx = 0;
  let buf: string[] = [];
  let bufLen = 0;

  const flush = (endIdxInclusive: number) => {
    if (endIdxInclusive < startIdx) return;
    const startCue = cues[startIdx];
    const endCue = cues[endIdxInclusive];
    const text = buf.join(" ").replace(/\s+/g, " ").trim();
    if (!text) return;
    chunks.push({
      cue_start_idx: startIdx,
      cue_end_idx: endIdxInclusive,
      start_ms: startCue.start_ms,
      end_ms: endCue.end_ms,
      text,
      token_estimate: estimateTokens(text),
    });
  };

  for (let i = 0; i < cues.length; i++) {
    const t = cues[i].text.trim();
    if (!t) continue;

    const nextLen = bufLen + t.length + 1;
    const shouldCut = nextLen > maxChars && bufLen >= minChars;
    if (shouldCut) {
      flush(i - 1);

      // Prepare overlap: move startIdx backwards by overlapCues from i-1.
      const newStartIdx = Math.max(0, i - overlapCues);
      startIdx = newStartIdx;
      buf = [];
      bufLen = 0;

      // Refill buffer from overlap range to current cue.
      for (let k = startIdx; k <= i; k++) {
        const tt = cues[k].text.trim();
        if (!tt) continue;
        buf.push(tt);
        bufLen += tt.length + 1;
      }
      continue;
    }

    buf.push(t);
    bufLen = nextLen;
  }

  flush(cues.length - 1);
  return chunks;
}

