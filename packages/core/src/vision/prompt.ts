/**
 * Prompt templates for frame analysis.
 * Pattern ported from video-analyzer (context carryover) and openscenesense-ollama (transcript alignment).
 */

export interface FrameAnalysisPromptOpts {
  /** Description of the previous frame, if context carryover is enabled */
  previousContext?: string | null;
  /** Transcript text overlapping this frame's timestamp */
  transcriptContext?: string | null;
  /** Frame timestamp in HH:MM:SS format */
  timestamp?: string | null;
}

const SCENE_TYPES = [
  "presentation",
  "talking_head",
  "screencast",
  "outdoor",
  "whiteboard",
  "diagram",
  "text_heavy",
  "b_roll",
  "animation",
  "other",
];

export function buildFrameAnalysisPrompt(opts?: FrameAnalysisPromptOpts): string {
  const parts: string[] = [];

  parts.push(
    "Analyze this video frame and respond with ONLY valid JSON (no markdown, no prose) matching this schema:",
    "{",
    '  "description": "2-3 sentence description of what is visually shown",',
    '  "objects": [{"label": "string", "confidence": 0.0-1.0}],',
    '  "text_overlay": "any text visible on screen, or null",',
    `  "scene_type": one of ${JSON.stringify(SCENE_TYPES)}, or null`,
    "}",
    "",
    "Rules:",
    "- Focus on VISUAL content: what is shown, displayed, or visible.",
    "- For presentations/slides: describe the content of the slide, charts, diagrams.",
    "- For text on screen: transcribe all visible text into text_overlay.",
    "- List significant objects (people, charts, code, UI elements).",
    "- Be specific about visual details (colors, layout, numbers on charts).",
    "- Do NOT describe audio or narration. Focus only on what you SEE.",
  );

  if (opts?.previousContext) {
    parts.push(
      "",
      "PREVIOUS FRAME CONTEXT (avoid repeating if scene is unchanged):",
      opts.previousContext,
    );
  }

  if (opts?.transcriptContext) {
    parts.push(
      "",
      "TRANSCRIPT AT THIS TIMESTAMP (use for context, but describe what is SHOWN, not what is SAID):",
      opts.transcriptContext,
    );
  }

  if (opts?.timestamp) {
    parts.push("", `Frame timestamp: ${opts.timestamp}`);
  }

  return parts.join("\n");
}

/**
 * Parse a vision LLM response. Handles both structured JSON and plain prose.
 */
export function parseVisionResponse(raw: string): {
  description: string;
  objects: Array<{ label: string; confidence?: number }>;
  textOverlay: string | null;
  sceneType: string | null;
} {
  // Try JSON parse first
  try {
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      description: String(parsed.description || "").trim(),
      objects: Array.isArray(parsed.objects)
        ? parsed.objects
            .filter((o: any) => o && typeof o.label === "string")
            .map((o: any) => ({
              label: String(o.label),
              confidence: typeof o.confidence === "number" ? o.confidence : undefined,
            }))
        : [],
      textOverlay: parsed.text_overlay ? String(parsed.text_overlay) : null,
      sceneType: parsed.scene_type ? String(parsed.scene_type) : null,
    };
  } catch {
    // Fallback: treat entire response as description
    return {
      description: raw.trim(),
      objects: [],
      textOverlay: null,
      sceneType: null,
    };
  }
}
