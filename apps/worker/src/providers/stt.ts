import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnCapture } from "@yt/core";
import { z } from "zod";

const OpenAITranscriptionSchema = z.object({
  text: z.string().optional(),
  segments: z
    .array(
      z.object({
        start: z.number(),
        end: z.number(),
        text: z.string(),
      })
    )
    .optional(),
});

export type SttCueRaw = { start: number; duration: number; text: string };

function clean(s: unknown): string {
  return typeof s === "string" ? s.trim() : "";
}

async function ensureAudioMp3(url: string, tmpDir: string, opts?: { timeoutMs?: number }): Promise<string> {
  const outPath = path.join(tmpDir, "audio.mp3");
  const template = path.join(tmpDir, "audio.%(ext)s");

  const args = [
    "--no-playlist",
    "--no-progress",
    "--quiet",
    "-f",
    "bestaudio/best",
    "-x",
    "--audio-format",
    "mp3",
    "--audio-quality",
    "5",
    "-o",
    template,
    url,
  ];

  const res = await spawnCapture("yt-dlp", args, { timeoutMs: opts?.timeoutMs ?? 600_000 });
  if (res.timedOut) throw new Error("yt-dlp timed out downloading audio");
  if (res.exitCode !== 0) throw new Error(`yt-dlp failed (exit ${res.exitCode}): ${res.stderr || res.stdout}`);

  if (!fs.existsSync(outPath)) {
    // yt-dlp sometimes chooses a different extension; pick the newest file.
    const files = fs
      .readdirSync(tmpDir)
      .map((f) => path.join(tmpDir, f))
      .filter((p) => fs.statSync(p).isFile())
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    const picked = files.find((p) => /\.(mp3|m4a|wav|webm|mp4)$/i.test(p));
    if (!picked) throw new Error("yt-dlp did not produce an audio file");
    return picked;
  }

  return outPath;
}

export async function transcribeYouTubeBestEffort(opts: {
  url: string;
  language: string;
}): Promise<{ provider: string; model: string | null; cues: SttCueRaw[] }> {
  const provider = clean(process.env.YIT_STT_PROVIDER).toLowerCase();
  if (!provider) throw new Error("stt disabled");

  if (provider === "mock") {
    return {
      provider: "mock",
      model: "mock",
      cues: [{ start: 0, duration: 5, text: `STT mock transcript for ${opts.url}` }],
    };
  }

  if (provider !== "openai") throw new Error(`unknown stt provider '${provider}'`);

  const apiKey = clean(process.env.OPENAI_API_KEY);
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const model = clean(process.env.YIT_OPENAI_STT_MODEL) || "whisper-1";
  const baseUrl = (clean(process.env.OPENAI_BASE_URL) || "https://api.openai.com").replace(/\/$/, "");

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "yit-stt-"));
  try {
    const audioPath = await ensureAudioMp3(opts.url, tmp);

    const args = [
      "-sS",
      "-X",
      "POST",
      `${baseUrl}/v1/audio/transcriptions`,
      "-H",
      `Authorization: Bearer ${apiKey}`,
      "-F",
      `model=${model}`,
      "-F",
      `response_format=verbose_json`,
      "-F",
      `language=${opts.language}`,
      "-F",
      `file=@${audioPath}`,
    ];

    const outPath = path.join(tmp, `openai-stt-${randomUUID()}.json`);
    const res = await spawnCapture("curl", args, { timeoutMs: 600_000 });
    if (res.timedOut) throw new Error("openai stt timed out");
    if (res.exitCode !== 0) throw new Error(`openai stt failed (exit ${res.exitCode}): ${res.stderr || res.stdout}`);

    fs.writeFileSync(outPath, res.stdout, "utf8");
    const parsed = OpenAITranscriptionSchema.parse(JSON.parse(res.stdout));
    const segments = parsed.segments || [];
    const cues: SttCueRaw[] = segments.length
      ? segments
          .map((s) => {
            const start = Math.max(0, Number(s.start));
            const end = Math.max(start, Number(s.end));
            const text = String(s.text || "").trim();
            return { start, duration: Math.max(0.01, end - start), text };
          })
          .filter((c) => c.text.length > 0)
      : parsed.text
        ? [{ start: 0, duration: 10, text: parsed.text.trim() }]
        : [];

    if (!cues.length) throw new Error("openai stt returned no segments");
    return { provider: "openai", model, cues };
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {}
  }
}

