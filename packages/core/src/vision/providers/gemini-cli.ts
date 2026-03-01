/**
 * Gemini CLI vision provider — runs frame analysis through the locally installed
 * `gemini` CLI. Free with Google AI Studio or Gemini API free tier.
 *
 * Saves the frame image to a temp file, passes it via stdin with the prompt.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { VisionProviderAdapter, VisionRequest, VisionResponse } from "../types";
import { parseVisionResponse } from "../prompt";
import { spawnCapture } from "../../llm/cli";

export interface GeminiCliVisionOpts {
  model?: string;
  timeoutMs?: number;
}

export function createGeminiCliVisionProvider(opts?: GeminiCliVisionOpts): VisionProviderAdapter {
  const model = opts?.model || "gemini-2.0-flash";
  const timeoutMs = opts?.timeoutMs ?? 120_000;

  return {
    name: "gemini-cli",
    model,
    async analyze(req: VisionRequest): Promise<VisionResponse> {
      const ext = req.mimeType === "image/png" ? ".png" : ".jpg";
      const tmpImg = path.join(os.tmpdir(), `yit-frame-${randomUUID()}${ext}`);

      try {
        fs.writeFileSync(tmpImg, Buffer.from(req.imageBase64, "base64"));

        // Gemini CLI: pass image file reference in prompt
        const prompt = `Analyze this image file: ${tmpImg}\n\n${req.prompt}`;

        const args = ["--output-format", "json", "--prompt", prompt];
        if (model) args.push("--model", model);

        const res = await spawnCapture("gemini", args, {
          timeoutMs,
          cwd: os.tmpdir(),
        });

        if (res.timedOut) throw new Error(`Gemini CLI timed out after ${timeoutMs}ms`);
        if (res.exitCode !== 0) {
          throw new Error(`Gemini CLI vision error (exit ${res.exitCode}): ${res.stderr || res.stdout}`);
        }

        // Parse Gemini CLI JSON output
        let text = "";
        try {
          const raw = JSON.parse(res.stdout.trim());
          text = typeof raw.response === "string" ? raw.response : "";
        } catch {
          text = res.stdout.trim();
        }

        const parsed = parseVisionResponse(text);

        return {
          description: parsed.description,
          objects: parsed.objects,
          textOverlay: parsed.textOverlay,
          sceneType: parsed.sceneType as VisionResponse["sceneType"],
          promptTokens: null,
          completionTokens: null,
          raw: { stdout: res.stdout, stderr: res.stderr, durationMs: res.durationMs },
        };
      } finally {
        try { fs.unlinkSync(tmpImg); } catch {}
      }
    },
  };
}
