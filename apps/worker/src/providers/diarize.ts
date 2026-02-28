import { spawn } from "child_process";
import path from "path";
import { z } from "zod";

const DiarizeProviderResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  backend: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  device: z.string().optional().nullable(),
  duration_ms: z.number().optional(),
  audio_url: z.string().optional(),
  speakers: z
    .array(
      z.object({
        key: z.string().min(1),
        segments: z.array(
          z.object({
            start_ms: z.number().int().nonnegative(),
            end_ms: z.number().int().nonnegative(),
            confidence: z.number().min(0).max(1).nullable().optional(),
          })
        ),
      })
    )
    .optional(),
});

export type DiarizeSpeaker = z.infer<typeof DiarizeProviderResultSchema>["speakers"] extends Array<infer T> ? T : never;

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
      reject(new Error(err.trim() || `diarize provider exited with code ${code}`));
    });
  });
}

async function runProvider(pythonBin: string, scriptPath: string, args: string[]): Promise<string> {
  try {
    return await spawnOnce(pythonBin, [scriptPath, ...args]);
  } catch (e: any) {
    // If python bin doesn't exist, allow caller to try the next one.
    if (e?.code === "ENOENT") throw Object.assign(new Error("python_not_found"), { code: "ENOENT" });
    throw e;
  }
}

export async function diarizeYouTubeBestEffort(opts: {
  url: string;
  backend: string;
  transcriptEndMs: number;
  pythonBin?: string;
}): Promise<{
  backend: string;
  model: string | null;
  device: string | null;
  duration_ms: number;
  speakers: Array<{ key: string; segments: Array<{ start_ms: number; end_ms: number; confidence: number | null }> }>;
}> {
  const scriptPath = path.resolve(process.cwd(), "python", "diarize.py");

  const args = [
    "--url",
    opts.url,
    "--backend",
    opts.backend,
    "--transcript-end-ms",
    String(Math.max(0, Math.floor(opts.transcriptEndMs))),
  ];

  const bins = [opts.pythonBin, process.env.YIT_PYTHON_BIN, "python3.11", "python3.12", "python3"].filter(
    (v): v is string => Boolean(v && String(v).trim())
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
  if (stdout == null) throw lastErr instanceof Error ? lastErr : new Error("failed to run python provider");

  const parsed = DiarizeProviderResultSchema.parse(JSON.parse(stdout));
  if (!parsed.ok) throw new Error(parsed.error || "Diarization provider failed");
  if (!parsed.speakers) throw new Error("Diarization provider returned no speakers");

  return {
    backend: parsed.backend ?? opts.backend,
    model: parsed.model ?? null,
    device: parsed.device ?? null,
    duration_ms: Math.max(0, Math.floor(parsed.duration_ms ?? 0)),
    speakers: parsed.speakers.map((s) => ({
      key: s.key,
      segments: s.segments.map((seg) => ({
        start_ms: seg.start_ms,
        end_ms: seg.end_ms,
        confidence: seg.confidence ?? null,
      })),
    })),
  };
}

