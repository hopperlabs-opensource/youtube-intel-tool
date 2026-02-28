import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type SpawnCaptureResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  durationMs: number;
};

export async function spawnCapture(
  cmd: string,
  args: string[],
  opts?: { stdin?: string; cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv }
): Promise<SpawnCaptureResult> {
  const startedAt = Date.now();
  const timeoutMs = Math.max(250, opts?.timeoutMs ?? 120_000);

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts?.cwd,
      env: { ...process.env, ...(opts?.env ?? {}) },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    // Prevent unhandled EPIPE when a child exits early while we're writing stdin.
    child.stdin.on("error", (err: any) => {
      if (err?.code === "EPIPE") return;
    });

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGKILL");
      } catch {}
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d: string) => (stdout += d));
    child.stderr.on("data", (d: string) => (stderr += d));

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code, signal, timedOut, durationMs: Date.now() - startedAt });
    });

    try {
      if (opts?.stdin) {
        child.stdin.write(opts.stdin);
      }
      child.stdin.end();
    } catch {}
  });
}

function defaultCliCwd(): string {
  // Running CLIs from the repo root causes some "agent" CLIs to ingest the whole workspace,
  // which is expensive and unnecessary for our use-case (we provide the full prompt ourselves).
  // Allow override for debugging.
  return (process.env.YIT_CLI_CWD || "").trim() || os.tmpdir();
}

function parseLooseJson(s: string): unknown {
  const trimmed = s.trim();
  if (!trimmed) throw new Error("empty output");
  try {
    return JSON.parse(trimmed);
  } catch {}

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const maybe = trimmed.slice(firstBrace, lastBrace + 1);
    return JSON.parse(maybe);
  }

  throw new Error("failed to parse JSON output");
}

export function extractJsonFromText(text: string): unknown {
  const s = text.trim();
  if (!s) throw new Error("empty response");

  // Direct JSON.
  try {
    return JSON.parse(s);
  } catch {}

  // ```json ... ```
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence?.[1]) {
    const inner = fence[1].trim();
    try {
      return JSON.parse(inner);
    } catch {}
  }

  // Best-effort: first {...} or [...]
  const firstObj = s.indexOf("{");
  const lastObj = s.lastIndexOf("}");
  if (firstObj !== -1 && lastObj !== -1 && lastObj > firstObj) {
    try {
      return JSON.parse(s.slice(firstObj, lastObj + 1));
    } catch {}
  }

  const firstArr = s.indexOf("[");
  const lastArr = s.lastIndexOf("]");
  if (firstArr !== -1 && lastArr !== -1 && lastArr > firstArr) {
    try {
      return JSON.parse(s.slice(firstArr, lastArr + 1));
    } catch {}
  }

  throw new Error("failed to extract JSON from response text");
}

export async function runGeminiCliStructured(opts: {
  prompt: string;
  input: string;
  model?: string;
  timeoutMs?: number;
}): Promise<{ structured: unknown; raw: unknown; stderr: string; durationMs: number }> {
  const args = ["--output-format", "json", "--prompt", opts.prompt];
  if (opts.model) args.push("--model", opts.model);

  const res = await spawnCapture("gemini", args, { stdin: opts.input, timeoutMs: opts.timeoutMs, cwd: defaultCliCwd() });
  if (res.timedOut) throw new Error(`gemini CLI timed out after ${opts.timeoutMs ?? 120_000}ms`);
  if (res.exitCode !== 0) throw new Error(`gemini CLI failed (exit ${res.exitCode}): ${res.stderr || res.stdout}`);

  const raw = parseLooseJson(res.stdout);
  const responseText =
    raw && typeof raw === "object" && raw !== null && typeof (raw as any).response === "string"
      ? String((raw as any).response)
      : null;
  if (!responseText) throw new Error("gemini CLI output missing 'response' field");
  const structured = extractJsonFromText(responseText);
  return { structured, raw, stderr: res.stderr, durationMs: res.durationMs };
}

export async function runGeminiCliText(opts: {
  prompt: string;
  input?: string;
  model?: string;
  timeoutMs?: number;
}): Promise<{ text: string; raw: unknown; stderr: string; durationMs: number }> {
  const args = ["--output-format", "json", "--prompt", opts.prompt];
  if (opts.model) args.push("--model", opts.model);

  const res = await spawnCapture("gemini", args, { stdin: opts.input, timeoutMs: opts.timeoutMs, cwd: defaultCliCwd() });
  if (res.timedOut) throw new Error(`gemini CLI timed out after ${opts.timeoutMs ?? 120_000}ms`);
  if (res.exitCode !== 0) throw new Error(`gemini CLI failed (exit ${res.exitCode}): ${res.stderr || res.stdout}`);

  const raw = parseLooseJson(res.stdout);
  const responseText =
    raw && typeof raw === "object" && raw !== null && typeof (raw as any).response === "string"
      ? String((raw as any).response)
      : null;
  if (responseText == null) throw new Error("gemini CLI output missing 'response' field");
  return { text: responseText, raw, stderr: res.stderr, durationMs: res.durationMs };
}

export async function runGeminiCliTextStream(opts: {
  prompt: string;
  input?: string;
  model?: string;
  timeoutMs?: number;
  onDelta: (delta: string) => void;
}): Promise<{ text: string; stderr: string; durationMs: number }> {
  const startedAt = Date.now();
  const timeoutMs = Math.max(250, opts.timeoutMs ?? 120_000);

  const args = ["--output-format", "stream-json", "--prompt", opts.prompt];
  if (opts.model) args.push("--model", opts.model);

  return new Promise((resolve, reject) => {
    const child = spawn("gemini", args, {
      cwd: defaultCliCwd(),
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdoutBuf = "";
    let stderr = "";
    let timedOut = false;
    let sawError: string | null = null;
    let text = "";

    // Prevent unhandled EPIPE when a child exits early while we're writing stdin.
    child.stdin.on("error", (err: any) => {
      if (err?.code === "EPIPE") return;
    });

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGKILL");
      } catch {}
    }, timeoutMs);

    function processLine(line: string) {
      const s = line.trim();
      if (!s) return;
      let ev: any;
      try {
        ev = JSON.parse(s);
      } catch {
        return;
      }

      if (ev && ev.type === "message" && ev.role === "assistant" && typeof ev.content === "string") {
        const isDelta = ev.delta === true || ev.delta === undefined;
        if (isDelta) {
          text += ev.content;
          try {
            opts.onDelta(ev.content);
          } catch {}
        } else if (!text) {
          // Some versions may emit a non-delta "full" message; only use it if we didn't stream deltas.
          text = ev.content;
          try {
            opts.onDelta(ev.content);
          } catch {}
        }
      }

      if (ev && ev.type === "error") {
        const msg =
          (typeof ev.message === "string" && ev.message) ||
          (typeof ev.error === "string" && ev.error) ||
          null;
        if (msg) sawError = msg;
      }
    }

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d: string) => {
      stdoutBuf += d;
      while (true) {
        const idx = stdoutBuf.indexOf("\n");
        if (idx === -1) break;
        const line = stdoutBuf.slice(0, idx);
        stdoutBuf = stdoutBuf.slice(idx + 1);
        processLine(line);
      }
    });
    child.stderr.on("data", (d: string) => (stderr += d));

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      // Flush last line without trailing newline.
      if (stdoutBuf.trim()) processLine(stdoutBuf);

      const durationMs = Date.now() - startedAt;
      if (timedOut) return reject(new Error(`gemini CLI timed out after ${timeoutMs}ms`));
      if (code !== 0) {
        const detail = (sawError || "").trim() || stderr.trim() || `exit ${code}`;
        return reject(new Error(`gemini CLI failed (${detail})`));
      }
      resolve({ text, stderr: stderr.trim(), durationMs });
    });

    try {
      if (opts.input) child.stdin.write(opts.input);
      child.stdin.end();
    } catch {}
  });
}

export async function runClaudeCliStructured(opts: {
  prompt: string;
  schema: unknown;
  model?: string;
  timeoutMs?: number;
}): Promise<{ structured: unknown; raw: unknown; stderr: string; durationMs: number }> {
  const args = ["-p", "--permission-mode", "plan", "--output-format", "json", "--json-schema", JSON.stringify(opts.schema)];
  if (opts.model) args.push("--model", opts.model);
  args.push(opts.prompt);

  const res = await spawnCapture("claude", args, { timeoutMs: opts.timeoutMs, cwd: defaultCliCwd() });
  if (res.timedOut) throw new Error(`claude CLI timed out after ${opts.timeoutMs ?? 120_000}ms`);
  if (res.exitCode !== 0) throw new Error(`claude CLI failed (exit ${res.exitCode}): ${res.stderr || res.stdout}`);

  const raw = parseLooseJson(res.stdout);
  const structured =
    raw && typeof raw === "object" && raw !== null && (raw as any).structured_output !== undefined
      ? (raw as any).structured_output
      : raw && typeof raw === "object" && raw !== null && typeof (raw as any).result === "string"
        ? extractJsonFromText(String((raw as any).result))
        : null;
  if (!structured) throw new Error("claude CLI output missing structured payload");
  return { structured, raw, stderr: res.stderr, durationMs: res.durationMs };
}

export async function runClaudeCliText(opts: {
  prompt: string;
  model?: string;
  timeoutMs?: number;
}): Promise<{ text: string; raw: unknown; stderr: string; durationMs: number }> {
  const args = ["-p", "--permission-mode", "plan", "--output-format", "json"];
  if (opts.model) args.push("--model", opts.model);
  args.push(opts.prompt);

  const res = await spawnCapture("claude", args, { timeoutMs: opts.timeoutMs, cwd: defaultCliCwd() });
  if (res.timedOut) throw new Error(`claude CLI timed out after ${opts.timeoutMs ?? 120_000}ms`);
  if (res.exitCode !== 0) throw new Error(`claude CLI failed (exit ${res.exitCode}): ${res.stderr || res.stdout}`);

  const raw = parseLooseJson(res.stdout);
  const text =
    raw && typeof raw === "object" && raw !== null && typeof (raw as any).result === "string"
      ? String((raw as any).result)
      : raw && typeof raw === "object" && raw !== null && typeof (raw as any).completion === "string"
        ? String((raw as any).completion)
        : null;
  if (text == null) throw new Error("claude CLI output missing text payload");
  return { text, raw, stderr: res.stderr, durationMs: res.durationMs };
}

export async function runCodexCliStructured(opts: {
  prompt: string;
  schema: unknown;
  model?: string;
  timeoutMs?: number;
}): Promise<{ structured: unknown; raw: unknown; stderr: string; durationMs: number }> {
  // Codex CLI supports a JSON Schema constraint via a schema *file*.
  // Use an isolated temp cwd to avoid pulling in repo context.
  const cwd = defaultCliCwd();
  const schemaPath = path.join(cwd, `yit-codex-schema-${randomUUID()}.json`);
  const outPath = path.join(cwd, `yit-codex-out-${randomUUID()}.json`);

  fs.writeFileSync(schemaPath, JSON.stringify(opts.schema, null, 2) + "\n", "utf8");

  const args = [
    "-s",
    "read-only",
    "-a",
    "on-failure",
    ...(opts.model ? ["-m", opts.model] : []),
    "exec",
    "--skip-git-repo-check",
    "--ephemeral",
    "-C",
    cwd,
    "--output-schema",
    schemaPath,
    "--output-last-message",
    outPath,
    "-",
  ];

  try {
    const res = await spawnCapture("codex", args, { stdin: opts.prompt, timeoutMs: opts.timeoutMs, cwd });
    if (res.timedOut) throw new Error(`codex CLI timed out after ${opts.timeoutMs ?? 120_000}ms`);
    if (res.exitCode !== 0) throw new Error(`codex CLI failed (exit ${res.exitCode}): ${res.stderr || res.stdout}`);

    const out = fs.readFileSync(outPath, "utf8").trim();
    const raw = parseLooseJson(out);
    return { structured: raw, raw, stderr: res.stderr, durationMs: res.durationMs };
  } finally {
    try {
      fs.unlinkSync(schemaPath);
    } catch {}
    try {
      fs.unlinkSync(outPath);
    } catch {}
  }
}

export async function runCodexCliText(opts: {
  prompt: string;
  model?: string;
  timeoutMs?: number;
}): Promise<{ text: string; raw: unknown; stderr: string; durationMs: number }> {
  const cwd = defaultCliCwd();
  const outPath = path.join(cwd, `yit-codex-out-${randomUUID()}.txt`);

  const args = [
    "-s",
    "read-only",
    "-a",
    "on-failure",
    ...(opts.model ? ["-m", opts.model] : []),
    "exec",
    "--skip-git-repo-check",
    "--ephemeral",
    "-C",
    cwd,
    "--output-last-message",
    outPath,
    "-",
  ];

  try {
    const res = await spawnCapture("codex", args, { stdin: opts.prompt, timeoutMs: opts.timeoutMs, cwd });
    if (res.timedOut) throw new Error(`codex CLI timed out after ${opts.timeoutMs ?? 120_000}ms`);
    if (res.exitCode !== 0) throw new Error(`codex CLI failed (exit ${res.exitCode}): ${res.stderr || res.stdout}`);

    const text = fs.readFileSync(outPath, "utf8").trim();
    if (!text) throw new Error("codex CLI returned empty output");
    return { text, raw: text, stderr: res.stderr, durationMs: res.durationMs };
  } finally {
    try {
      fs.unlinkSync(outPath);
    } catch {}
  }
}
