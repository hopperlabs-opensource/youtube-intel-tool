import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";

const TranscriptProviderResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  language: z.string().optional(),
  is_generated: z.boolean().optional(),
  cues: z
    .array(
      z.object({
        start: z.number(),
        duration: z.number(),
        text: z.string(),
      })
    )
    .optional(),
});

export type TranscriptCueRaw = { start: number; duration: number; text: string };

export async function fetchTranscriptBestEffort(opts: {
  providerVideoId: string;
  language: string;
}): Promise<{ is_generated: boolean; cues: TranscriptCueRaw[] }> {
  const scriptPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "python", "fetch_transcript.py");
  const pythonBin = (process.env.YIT_PYTHON_BIN || process.env.PYTHON_BIN || "python3").trim() || "python3";

  const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const proc = spawn(pythonBin, [scriptPath, "--video-id", opts.providerVideoId, "--lang", opts.language], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => (out += String(d)));
    proc.stderr.on("data", (d) => (err += String(d)));
    proc.on("error", reject);
    proc.on("close", (code) => {
      resolve({ stdout: out.trim(), stderr: err.trim() });
    });
  });

  // The provider returns JSON on stdout even when failing. Prefer that error.
  let parsed: z.infer<typeof TranscriptProviderResultSchema> | null = null;
  try {
    parsed = TranscriptProviderResultSchema.parse(JSON.parse(stdout));
  } catch {
    parsed = null;
  }

  if (parsed && !parsed.ok) {
    throw new Error(parsed.error || "Transcript provider failed");
  }

  if (!parsed) {
    throw new Error(stderr || "Transcript provider returned invalid JSON");
  }

  if (!parsed.ok) throw new Error(parsed.error || "Transcript provider failed");
  if (!parsed.cues) throw new Error("Transcript provider returned no cues");
  return { is_generated: Boolean(parsed.is_generated), cues: parsed.cues };
}
