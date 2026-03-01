/**
 * Narrative synthesis — generates a coherent video summary from frame analyses
 * and optional transcript context. Uses an LLM to distill timestamped visual
 * descriptions into a readable narrative.
 *
 * Pattern ported from video-analyzer (Apache-2.0): context assembly → LLM summary → structured output.
 */

import type { TranscriptCue, SceneType } from "@yt/contracts";
import type { FrameAnalysis } from "./analyze";
import { withRetry, type RetryOpts } from "../vision/retry";

export interface NarrativeSynthesis {
  /** Video-level summary of visual content */
  summary: string;
  /** Key visual moments with timestamps */
  keyMoments: Array<{ timestampMs: number; description: string }>;
  /** Recurring visual themes (e.g., "code demos", "slide presentations") */
  visualThemes: string[];
  /** Scene type breakdown */
  sceneBreakdown: Array<{ sceneType: SceneType; count: number; percentage: number }>;
  /** Total frames that informed the narrative */
  totalFrames: number;
}

export interface SynthesizeOpts {
  /** Frame analyses to synthesize */
  analyses: FrameAnalysis[];
  /** Optional transcript cues for richer narrative */
  transcriptCues?: TranscriptCue[];
  /** LLM call function — takes a text prompt, returns text */
  llmCall: (prompt: string) => Promise<string>;
  /** Retry options for the LLM call */
  retry?: RetryOpts;
  /** Max frames to include in synthesis context (default 60) */
  maxContextFrames?: number;
}

function formatHms(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/**
 * Compute scene type breakdown from analyses.
 */
function computeSceneBreakdown(
  analyses: FrameAnalysis[],
): NarrativeSynthesis["sceneBreakdown"] {
  const counts = new Map<string, number>();
  let total = 0;

  for (const a of analyses) {
    if (a.sceneType) {
      counts.set(a.sceneType, (counts.get(a.sceneType) ?? 0) + 1);
      total++;
    }
  }

  if (total === 0) return [];

  return Array.from(counts.entries())
    .map(([sceneType, count]) => ({
      sceneType: sceneType as SceneType,
      count,
      percentage: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Sample analyses evenly if there are more than maxContextFrames.
 */
function sampleAnalyses(analyses: FrameAnalysis[], max: number): FrameAnalysis[] {
  if (analyses.length <= max) return analyses;

  const step = analyses.length / max;
  const sampled: FrameAnalysis[] = [];
  for (let i = 0; i < max; i++) {
    sampled.push(analyses[Math.floor(i * step)]);
  }
  return sampled;
}

/**
 * Build the synthesis prompt with frame descriptions and optional transcript.
 */
function buildSynthesisPrompt(
  analyses: FrameAnalysis[],
  transcriptCues?: TranscriptCue[],
): string {
  const parts: string[] = [];

  parts.push(
    "You are analyzing a sequence of timestamped visual descriptions from a video.",
    "Synthesize these into a coherent narrative. Respond with ONLY valid JSON (no markdown, no prose):",
    "{",
    '  "summary": "3-5 paragraph narrative of what happens visually in this video",',
    '  "key_moments": [{"timestamp_ms": 0, "description": "brief description"}],',
    '  "visual_themes": ["theme1", "theme2"]',
    "}",
    "",
    "Rules:",
    "- Write the summary as a flowing narrative, not a list.",
    "- Identify 5-10 key visual moments that represent major transitions or important content.",
    "- Extract 3-7 recurring visual themes (e.g., 'code demonstrations', 'slide presentations', 'whiteboard diagrams').",
    "- Focus on WHAT IS SHOWN, not what is said.",
    "- If transcript context is provided, use it to understand the purpose of visual elements.",
    "",
    "=== VISUAL FRAME DESCRIPTIONS ===",
  );

  for (const a of analyses) {
    const line = `[${formatHms(a.timestampMs)}] ${a.description}`;
    const extras: string[] = [];
    if (a.textOverlay) extras.push(`Text on screen: "${a.textOverlay}"`);
    if (a.sceneType) extras.push(`Scene: ${a.sceneType}`);
    if (a.objects.length > 0) extras.push(`Objects: ${a.objects.map((o) => o.label).join(", ")}`);

    parts.push(line);
    if (extras.length > 0) parts.push(`  ${extras.join(" | ")}`);
  }

  if (transcriptCues && transcriptCues.length > 0) {
    parts.push("", "=== TRANSCRIPT CONTEXT (first 2000 chars) ===");
    let totalChars = 0;
    for (const c of transcriptCues) {
      if (totalChars > 2000) break;
      parts.push(`[${formatHms(c.start_ms)}] ${c.text}`);
      totalChars += c.text.length;
    }
  }

  return parts.join("\n");
}

/**
 * Parse the LLM synthesis response.
 */
function parseSynthesisResponse(raw: string): {
  summary: string;
  keyMoments: Array<{ timestampMs: number; description: string }>;
  visualThemes: string[];
} {
  try {
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      summary: String(parsed.summary || "").trim(),
      keyMoments: Array.isArray(parsed.key_moments)
        ? parsed.key_moments
            .filter((m: any) => m && typeof m.timestamp_ms === "number")
            .map((m: any) => ({
              timestampMs: m.timestamp_ms,
              description: String(m.description || ""),
            }))
        : [],
      visualThemes: Array.isArray(parsed.visual_themes)
        ? parsed.visual_themes.filter((t: any) => typeof t === "string")
        : [],
    };
  } catch {
    // Fallback: use raw text as summary
    return {
      summary: raw.trim(),
      keyMoments: [],
      visualThemes: [],
    };
  }
}

/**
 * Generate a narrative synthesis from frame analyses.
 *
 * The `llmCall` function abstracts the LLM provider — it takes a text prompt
 * and returns text. This can be backed by any chat/completion API.
 *
 * Example:
 * ```ts
 * const narrative = await synthesizeNarrative({
 *   analyses,
 *   llmCall: async (prompt) => {
 *     const res = await fetch('...', { body: JSON.stringify({ prompt }) });
 *     return (await res.json()).text;
 *   },
 * });
 * ```
 */
export async function synthesizeNarrative(opts: SynthesizeOpts): Promise<NarrativeSynthesis> {
  const {
    analyses,
    transcriptCues,
    llmCall,
    retry: retryOpts,
    maxContextFrames = 60,
  } = opts;

  if (analyses.length === 0) {
    return {
      summary: "No visual content was analyzed for this video.",
      keyMoments: [],
      visualThemes: [],
      sceneBreakdown: [],
      totalFrames: 0,
    };
  }

  // Sample if too many frames for context window
  const sampled = sampleAnalyses(analyses, maxContextFrames);
  const prompt = buildSynthesisPrompt(sampled, transcriptCues);

  // Call LLM with retry
  const rawResponse = await withRetry(() => llmCall(prompt), retryOpts);
  const parsed = parseSynthesisResponse(rawResponse);

  return {
    summary: parsed.summary,
    keyMoments: parsed.keyMoments,
    visualThemes: parsed.visualThemes,
    sceneBreakdown: computeSceneBreakdown(analyses),
    totalFrames: analyses.length,
  };
}
