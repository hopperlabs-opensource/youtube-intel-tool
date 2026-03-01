import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";

const VoiceEmbedResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  model: z.string().optional(),
  device: z.string().optional(),
  speakers: z
    .array(
      z.object({
        label: z.string(),
        embedding_256d: z.array(z.number()),
        segment_count: z.number().int(),
      }),
    )
    .optional(),
});

export type VoiceEmbedResult = z.infer<typeof VoiceEmbedResultSchema>;

function spawnOnce(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => (out += String(d)));
    proc.stderr.on("data", (d) => (err += String(d)));
    proc.on("error", (e: any) => reject(e));
    proc.on("close", (code) => {
      if (code === 0) return resolve(out.trim());
      reject(new Error(err.trim() || `voice_embed.py exited with code ${code}`));
    });
  });
}

async function runProvider(pythonBin: string, scriptPath: string, args: string[]): Promise<string> {
  try {
    return await spawnOnce(pythonBin, [scriptPath, ...args]);
  } catch (e: any) {
    if (e?.code === "ENOENT") throw Object.assign(new Error("python_not_found"), { code: "ENOENT" });
    throw e;
  }
}

export async function runVoiceEmbedding(opts: {
  audioPath: string;
  segmentsJsonPath: string;
  pythonBin?: string;
}): Promise<VoiceEmbedResult> {
  const scriptPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "python",
    "voice_embed.py",
  );

  const args = ["--audio-path", opts.audioPath, "--segments-json", opts.segmentsJsonPath];

  const bins = [opts.pythonBin, process.env.YIT_PYTHON_BIN, "python3.11", "python3.12", "python3"].filter(
    (v): v is string => Boolean(v && String(v).trim()),
  );

  let stdout: string | null = null;
  let lastErr: unknown = null;
  for (const bin of bins) {
    try {
      stdout = await runProvider(bin, scriptPath, args);
      break;
    } catch (e: any) {
      lastErr = e;
      if (e?.code === "ENOENT") continue;
      throw e;
    }
  }
  if (stdout == null) throw lastErr instanceof Error ? lastErr : new Error("failed to run python voice provider");

  const parsed = VoiceEmbedResultSchema.parse(JSON.parse(stdout));
  if (!parsed.ok) throw new Error(parsed.error || "Voice embedding provider failed");

  return parsed;
}
