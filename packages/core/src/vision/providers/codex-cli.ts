/**
 * Codex CLI vision provider — runs frame analysis through the locally installed
 * `codex` CLI. Uses OpenAI API via the Codex CLI's built-in auth.
 *
 * This provider saves the frame image to a temp file and passes it via the native
 * `--image` flag for proper multimodal input.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { VisionProviderAdapter, VisionRequest, VisionResponse } from "../types";
import { parseVisionResponse } from "../prompt";
import { spawnCapture } from "../../llm/cli";

export interface CodexCliVisionOpts {
  model?: string;
  timeoutMs?: number;
}

export function createCodexCliVisionProvider(opts?: CodexCliVisionOpts): VisionProviderAdapter {
  const model = opts?.model || "o4-mini";
  const timeoutMs = opts?.timeoutMs ?? 120_000;

  return {
    name: "codex-cli",
    model,
    async analyze(req: VisionRequest): Promise<VisionResponse> {
      const ext = req.mimeType === "image/png" ? ".png" : ".jpg";
      const tmpImg = path.join(os.tmpdir(), `yit-frame-${randomUUID()}${ext}`);
      const outPath = path.join(os.tmpdir(), `yit-codex-out-${randomUUID()}.json`);

      try {
        fs.writeFileSync(tmpImg, Buffer.from(req.imageBase64, "base64"));

        const args = [
          "-s", "read-only",
          "-a", "on-failure",
          ...(model ? ["-m", model] : []),
          "--image", tmpImg,                    // Native image attachment
          "exec",
          "--skip-git-repo-check",
          "--ephemeral",
          "-C", os.tmpdir(),
          "--output-last-message", outPath,
          "-",                                  // Read prompt from stdin
        ];

        // stdin is just the analysis prompt — no file path embedded
        const res = await spawnCapture("codex", args, {
          stdin: req.prompt,
          timeoutMs,
          cwd: os.tmpdir(),
        });

        if (res.timedOut) throw new Error(`Codex CLI timed out after ${timeoutMs}ms`);
        if (res.exitCode !== 0) {
          throw new Error(`Codex CLI vision error (exit ${res.exitCode}): ${res.stderr || res.stdout}`);
        }

        let text = "";
        try {
          text = fs.readFileSync(outPath, "utf8").trim();
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
        try { fs.unlinkSync(outPath); } catch {}
      }
    },
  };
}
