import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";

const FaceDetectResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  model: z.string().optional(),
  device: z.string().optional(),
  total_faces: z.number().optional(),
  frames_processed: z.number().optional(),
  frames_with_faces: z.number().optional(),
  frames: z
    .array(
      z.object({
        filename: z.string(),
        frame_index: z.number().int(),
        faces: z.array(
          z.object({
            bbox: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
            det_score: z.number(),
            embedding_512d: z.array(z.number()),
            landmarks: z.any().nullable().optional(),
          }),
        ),
      }),
    )
    .optional(),
});

export type FaceDetectResult = z.infer<typeof FaceDetectResultSchema>;

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
      reject(new Error(err.trim() || `face_index.py exited with code ${code}`));
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

export async function runFaceDetection(opts: {
  framesDir: string;
  detThreshold?: number;
  model?: string;
  pythonBin?: string;
}): Promise<FaceDetectResult> {
  const scriptPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "python",
    "face_index.py",
  );

  const args = ["--frames-dir", opts.framesDir];
  if (opts.detThreshold !== undefined) args.push("--det-threshold", String(opts.detThreshold));
  if (opts.model) args.push("--model", opts.model);

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
  if (stdout == null) throw lastErr instanceof Error ? lastErr : new Error("failed to run python face provider");

  const parsed = FaceDetectResultSchema.parse(JSON.parse(stdout));
  if (!parsed.ok) throw new Error(parsed.error || "Face detection provider failed");

  return parsed;
}
