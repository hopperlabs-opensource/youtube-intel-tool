import type { FrameAnalysisRow } from "@yt/contracts";
import type { DetectedChapter } from "./detect";

/**
 * Generate chapter titles using LLM. Batches all chapters into one call.
 */
export async function generateChapterTitles(
  chapters: DetectedChapter[],
  analyses: FrameAnalysisRow[],
  cues: Array<{ start_ms: number; end_ms: number; text: string }>,
  llmCall: (prompt: string) => Promise<string>,
): Promise<string[]> {
  if (chapters.length === 0) return [];

  const chapterDescriptions = chapters.map((ch, idx) => {
    // Find analyses and cues that overlap this chapter
    const relevantAnalyses = analyses
      .filter((a) => a.start_ms >= ch.start_ms && a.start_ms < ch.end_ms)
      .slice(0, 3);
    const relevantCues = cues
      .filter((c) => c.start_ms >= ch.start_ms && c.start_ms < ch.end_ms)
      .slice(0, 5);

    const visualContext = relevantAnalyses
      .map((a) => `  [Visual] ${a.description.slice(0, 100)}`)
      .join("\n");
    const transcriptContext = relevantCues
      .map((c) => `  [Transcript] ${c.text.slice(0, 100)}`)
      .join("\n");

    return [
      `Chapter ${idx + 1}: ${formatMs(ch.start_ms)} - ${formatMs(ch.end_ms)}`,
      `  Signals: ${ch.signals.join(", ") || "none"}`,
      visualContext || "  [No visual context]",
      transcriptContext || "  [No transcript context]",
    ].join("\n");
  });

  const prompt = [
    "Generate short chapter titles (5-10 words each) for these video chapters based on the visual and transcript context.",
    "Return ONLY valid JSON: { \"titles\": [\"title1\", \"title2\", ...] }",
    `Generate exactly ${chapters.length} titles.`,
    "",
    ...chapterDescriptions,
  ].join("\n");

  try {
    const raw = await llmCall(prompt);
    const parsed = parseResponse(raw, chapters.length);
    return parsed;
  } catch {
    // Fallback: generate generic titles
    return chapters.map((ch, idx) => {
      if (ch.signals.length > 0) {
        return `Section ${idx + 1}: ${ch.signals[0].replace(/_/g, " ")}`;
      }
      return `Section ${idx + 1}`;
    });
  }
}

function parseResponse(raw: string, expected: number): string[] {
  const text = raw.trim();
  let obj: any;
  try {
    obj = JSON.parse(text);
  } catch {
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fence?.[1]) {
      obj = JSON.parse(fence[1].trim());
    } else {
      const first = text.indexOf("{");
      const last = text.lastIndexOf("}");
      if (first !== -1 && last > first) {
        obj = JSON.parse(text.slice(first, last + 1));
      } else {
        throw new Error("Failed to parse title response");
      }
    }
  }

  if (Array.isArray(obj?.titles)) {
    return obj.titles.map((t: unknown) => String(t).trim()).slice(0, expected);
  }
  throw new Error("Response missing 'titles' array");
}

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
