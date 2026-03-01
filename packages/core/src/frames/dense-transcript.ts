import type { FrameAnalysisRow, TranscriptCue } from "@yt/contracts";

export interface DenseCue {
  start_ms: number;
  end_ms: number;
  description: string;
  interpolated: boolean;
  scene_type: string | null;
  source_frame_id: string | null;
  confidence: number | null;
}

export interface BuildDenseTranscriptOpts {
  analyses: FrameAnalysisRow[];
  transcriptCues?: TranscriptCue[];
  llmCall: (prompt: string) => Promise<string>;
  gapThresholdMs?: number;
}

/**
 * Build a dense second-by-second action transcript from sparse frame analyses.
 * For gaps > gapThresholdMs between keyframes, generates interpolated descriptions
 * using text-only LLM calls.
 */
export async function buildDenseActionTranscript(
  opts: BuildDenseTranscriptOpts,
): Promise<DenseCue[]> {
  const { analyses, transcriptCues = [], llmCall, gapThresholdMs = 3000 } = opts;

  if (analyses.length === 0) return [];

  const sorted = [...analyses].sort((a, b) => a.start_ms - b.start_ms);
  const result: DenseCue[] = [];

  // First, create direct cues from frame analyses
  for (const a of sorted) {
    result.push({
      start_ms: a.start_ms,
      end_ms: a.end_ms,
      description: a.description,
      interpolated: false,
      scene_type: a.scene_type,
      source_frame_id: a.frame_id,
      confidence: 1.0,
    });
  }

  // Find gaps between keyframes that need interpolation
  const gaps: Array<{
    prevAnalysis: FrameAnalysisRow;
    nextAnalysis: FrameAnalysisRow;
    gapStart: number;
    gapEnd: number;
    overlappingCues: TranscriptCue[];
  }> = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const prev = sorted[i];
    const next = sorted[i + 1];
    const gapStart = prev.end_ms;
    const gapEnd = next.start_ms;
    const gapDuration = gapEnd - gapStart;

    if (gapDuration <= gapThresholdMs) continue;

    // Find transcript cues overlapping this gap
    const overlapping = transcriptCues.filter(
      (c) => c.start_ms < gapEnd && c.end_ms > gapStart,
    );

    gaps.push({ prevAnalysis: prev, nextAnalysis: next, gapStart, gapEnd, overlappingCues: overlapping });
  }

  if (gaps.length === 0) {
    return result.sort((a, b) => a.start_ms - b.start_ms);
  }

  // Batch gaps into groups of ~5 for efficient LLM calls
  const batchSize = 5;
  for (let i = 0; i < gaps.length; i += batchSize) {
    const batch = gaps.slice(i, i + batchSize);
    const interpolated = await interpolateGapBatch(batch, llmCall);
    result.push(...interpolated);
  }

  return result.sort((a, b) => a.start_ms - b.start_ms);
}

async function interpolateGapBatch(
  gaps: Array<{
    prevAnalysis: FrameAnalysisRow;
    nextAnalysis: FrameAnalysisRow;
    gapStart: number;
    gapEnd: number;
    overlappingCues: TranscriptCue[];
  }>,
  llmCall: (prompt: string) => Promise<string>,
): Promise<DenseCue[]> {
  const gapDescriptions = gaps.map((g, idx) => {
    const cueText = g.overlappingCues.length > 0
      ? `\nTranscript during gap: ${g.overlappingCues.map((c) => `[${formatMs(c.start_ms)}] ${c.text}`).join(" | ")}`
      : "";
    const slotsNeeded = Math.max(1, Math.floor((g.gapEnd - g.gapStart) / 1000));
    return [
      `GAP ${idx + 1}:`,
      `  Before (${formatMs(g.prevAnalysis.end_ms)}): ${g.prevAnalysis.description}`,
      `  After (${formatMs(g.nextAnalysis.start_ms)}): ${g.nextAnalysis.description}`,
      `  Scene before: ${g.prevAnalysis.scene_type ?? "unknown"}`,
      `  Scene after: ${g.nextAnalysis.scene_type ?? "unknown"}`,
      `  Duration: ${g.gapEnd - g.gapStart}ms (need ${slotsNeeded} descriptions)`,
      `  Time range: ${formatMs(g.gapStart)} to ${formatMs(g.gapEnd)}`,
      cueText,
    ].join("\n");
  });

  const prompt = [
    "You are generating dense second-by-second visual action descriptions for gaps between analyzed video keyframes.",
    "For each gap, generate 1-second descriptions that smoothly bridge from the 'before' to 'after' context.",
    "If the scene type changes, add a transition description.",
    "If transcript text is available, incorporate what is being said.",
    "",
    "Return ONLY valid JSON: { \"gaps\": [ { \"gap_index\": number, \"cues\": [ { \"offset_s\": number, \"description\": string, \"scene_type\": string } ] } ] }",
    "",
    ...gapDescriptions,
  ].join("\n");

  try {
    const raw = await llmCall(prompt);
    const parsed = parseInterpolationResponse(raw);
    const result: DenseCue[] = [];

    for (const gapResult of parsed) {
      const gap = gaps[gapResult.gap_index];
      if (!gap) continue;

      for (const cue of gapResult.cues) {
        const start_ms = gap.gapStart + Math.floor(cue.offset_s * 1000);
        const end_ms = Math.min(start_ms + 1000, gap.gapEnd);
        if (start_ms >= gap.gapEnd) continue;

        result.push({
          start_ms,
          end_ms,
          description: cue.description,
          interpolated: true,
          scene_type: cue.scene_type || null,
          source_frame_id: null,
          confidence: 0.6,
        });
      }
    }

    return result;
  } catch {
    // If LLM fails, generate simple placeholder cues
    const result: DenseCue[] = [];
    for (const gap of gaps) {
      const sceneType = gap.prevAnalysis.scene_type === gap.nextAnalysis.scene_type
        ? gap.prevAnalysis.scene_type
        : null;
      const slotsNeeded = Math.max(1, Math.floor((gap.gapEnd - gap.gapStart) / 1000));
      for (let s = 0; s < slotsNeeded; s++) {
        const start_ms = gap.gapStart + s * 1000;
        const end_ms = Math.min(start_ms + 1000, gap.gapEnd);
        if (start_ms >= gap.gapEnd) break;
        result.push({
          start_ms,
          end_ms,
          description: `(Continuation of ${sceneType ?? "scene"})`,
          interpolated: true,
          scene_type: sceneType,
          source_frame_id: null,
          confidence: 0.3,
        });
      }
    }
    return result;
  }
}

function parseInterpolationResponse(raw: string): Array<{
  gap_index: number;
  cues: Array<{ offset_s: number; description: string; scene_type: string }>;
}> {
  const text = raw.trim();
  // Try direct JSON parse
  let obj: any;
  try {
    obj = JSON.parse(text);
  } catch {
    // Try extracting from markdown fence
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fence?.[1]) {
      obj = JSON.parse(fence[1].trim());
    } else {
      const first = text.indexOf("{");
      const last = text.lastIndexOf("}");
      if (first !== -1 && last > first) {
        obj = JSON.parse(text.slice(first, last + 1));
      } else {
        return [];
      }
    }
  }

  if (!obj?.gaps || !Array.isArray(obj.gaps)) return [];
  return obj.gaps;
}

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
