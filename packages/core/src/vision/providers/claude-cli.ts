/**
 * Claude CLI vision provider — runs frame analysis through the locally installed
 * `claude` CLI (Claude Code). Free with Claude Pro/Team/Enterprise subscriptions.
 *
 * This provider saves the frame image to a temp file, then invokes the Claude CLI
 * with explicit instructions to read the image via its Read tool. No API key needed.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { VisionProviderAdapter, VisionRequest, VisionResponse } from "../types";
import { parseVisionResponse } from "../prompt";
import { spawnCapture } from "../../llm/cli";

export interface ClaudeCliVisionOpts {
  model?: string;
  timeoutMs?: number;
}

export function createClaudeCliVisionProvider(opts?: ClaudeCliVisionOpts): VisionProviderAdapter {
  const model = opts?.model || "sonnet";
  const timeoutMs = opts?.timeoutMs ?? 120_000;

  return {
    name: "claude-cli",
    model,
    async analyze(req: VisionRequest): Promise<VisionResponse> {
      // Save image to temp file
      const ext = req.mimeType === "image/png" ? ".png" : ".jpg";
      const tmpImg = path.join(os.tmpdir(), `yit-frame-${randomUUID()}${ext}`);

      try {
        fs.writeFileSync(tmpImg, Buffer.from(req.imageBase64, "base64"));

        // Explicitly instruct Claude CLI to read the image file using the Read tool.
        // The Read tool natively presents images visually to the model.
        const prompt = [
          `Read the image file at ${tmpImg} using the Read tool, then analyze it.`,
          ``,
          req.prompt,
        ].join("\n");

        const args = [
          "-p",
          "--permission-mode", "default",     // Not "plan" — plan mode may prevent tool use
          "--output-format", "json",
          "--allowedTools", "Read",            // Only allow Read tool (safe, read-only)
          "--add-dir", path.dirname(tmpImg),   // Ensure access to temp dir
        ];
        if (model) args.push("--model", model);
        args.push(prompt);

        const res = await spawnCapture("claude", args, {
          timeoutMs,
          cwd: os.tmpdir(),
        });

        if (res.timedOut) throw new Error(`Claude CLI timed out after ${timeoutMs}ms`);
        if (res.exitCode !== 0) {
          throw new Error(`Claude CLI vision error (exit ${res.exitCode}): ${res.stderr || res.stdout}`);
        }

        // Parse Claude CLI JSON output
        let text = "";
        try {
          const raw = JSON.parse(res.stdout.trim());
          text = raw.result || raw.completion || raw.content || "";
        } catch {
          // Fallback: try extracting text from raw output
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
