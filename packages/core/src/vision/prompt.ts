/**
 * Prompt templates for frame analysis.
 * Pattern ported from video-analyzer (context carryover), openscenesense-ollama (transcript alignment),
 * and klippbok (multi-template prompt library).
 */

export interface FrameAnalysisPromptOpts {
  /** Description of the previous frame, if context carryover is enabled */
  previousContext?: string | null;
  /** Transcript text overlapping this frame's timestamp */
  transcriptContext?: string | null;
  /** Frame timestamp in HH:MM:SS format */
  timestamp?: string | null;
  /** Which prompt template to use (default: "describe") */
  template?: PromptTemplate;
}

/**
 * Available prompt templates for different analysis use cases.
 * Pattern from klippbok (caption, style, motion) and openscenesense-ollama (configurable templates).
 */
export type PromptTemplate = "describe" | "caption" | "ocr" | "slide" | "audit";

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

/**
 * Template definitions. Each template has a system instruction and JSON schema.
 */
const TEMPLATES: Record<PromptTemplate, { instruction: string; schema: string }> = {
  describe: {
    instruction: [
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
    ].join("\n"),
    schema: '{"description":"string","objects":[{"label":"string","confidence":0.0}],"text_overlay":"string|null","scene_type":"string|null"}',
  },

  caption: {
    instruction: [
      "Write a concise 1-sentence caption for this video frame.",
      "Respond with ONLY valid JSON:",
      '{  "description": "One clear sentence describing the frame",',
      '   "objects": [],',
      '   "text_overlay": null,',
      '   "scene_type": null',
      "}",
      "",
      "Rules:",
      "- One sentence maximum, under 100 characters.",
      "- Focus on the single most important visual element.",
      "- Be specific: 'A bar chart shows Q3 revenue at $4.2M' not 'A chart is displayed'.",
    ].join("\n"),
    schema: '{"description":"string"}',
  },

  ocr: {
    instruction: [
      "Extract ALL visible text from this video frame.",
      "Respond with ONLY valid JSON:",
      "{",
      '  "description": "Brief description of where text appears (e.g., slide title, code editor, terminal)",',
      '  "objects": [],',
      '  "text_overlay": "ALL text visible in the frame, preserving line breaks with \\n",',
      `  "scene_type": one of ${JSON.stringify(SCENE_TYPES)}, or null`,
      "}",
      "",
      "Rules:",
      "- Transcribe EVERY piece of text you can see: titles, labels, code, URLs, watermarks.",
      "- Preserve layout structure with line breaks.",
      "- For code: include indentation and syntax.",
      "- For charts: include axis labels, legend text, and data values.",
      "- If no text is visible, set text_overlay to null.",
    ].join("\n"),
    schema: '{"description":"string","text_overlay":"string|null","scene_type":"string|null"}',
  },

  slide: {
    instruction: [
      "Analyze this presentation slide or text-heavy frame in detail.",
      "Respond with ONLY valid JSON:",
      "{",
      '  "description": "3-5 sentence detailed description of the slide content, structure, and visual design",',
      '  "objects": [{"label": "string", "confidence": 0.0-1.0}],',
      '  "text_overlay": "Complete transcription of all text on the slide",',
      `  "scene_type": one of ${JSON.stringify(SCENE_TYPES)}, or null`,
      "}",
      "",
      "Rules:",
      "- Describe the slide's main message and structure (title, bullet points, images, charts).",
      "- Transcribe ALL text including titles, subtitles, bullet points, footnotes, and labels.",
      "- For charts/diagrams: describe the data shown, axes, trends, and key takeaways.",
      "- Note the visual design: colors, layout, branding elements.",
      "- Identify the slide's purpose in the presentation flow.",
    ].join("\n"),
    schema: '{"description":"string","objects":[{"label":"string"}],"text_overlay":"string","scene_type":"string"}',
  },

  audit: {
    instruction: [
      "Evaluate the quality and informativeness of this video frame for analysis.",
      "Respond with ONLY valid JSON:",
      "{",
      '  "description": "Assessment of what the frame shows and its analytical value",',
      '  "objects": [{"label": "string", "confidence": 0.0-1.0}],',
      '  "text_overlay": null,',
      '  "scene_type": null,',
      '  "quality_score": 0.0-1.0,',
      '  "issues": ["list of quality issues if any"]',
      "}",
      "",
      "Rules:",
      "- Score 0.8-1.0: Frame has unique, informative visual content worth indexing.",
      "- Score 0.5-0.8: Frame has some value but is partially redundant or unclear.",
      "- Score 0.2-0.5: Frame is low-quality (blurry, transition, mostly blank).",
      "- Score 0.0-0.2: Frame is useless (completely blank, corrupted, or duplicate).",
      "- List specific issues: 'blurry', 'transition frame', 'mostly black', 'no unique content'.",
    ].join("\n"),
    schema: '{"description":"string","quality_score":0.0,"issues":["string"]}',
  },
};

export function buildFrameAnalysisPrompt(opts?: FrameAnalysisPromptOpts): string {
  const template = opts?.template ?? "describe";
  const tmpl = TEMPLATES[template];
  const parts: string[] = [tmpl.instruction];

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
 * Get the list of available prompt template names.
 */
export function getAvailableTemplates(): PromptTemplate[] {
  return Object.keys(TEMPLATES) as PromptTemplate[];
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
