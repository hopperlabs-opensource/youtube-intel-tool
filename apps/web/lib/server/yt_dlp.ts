import { spawn } from "node:child_process";

export function isYtDlpMissingError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.toLowerCase();
  return m.includes("enoent") || m.includes("spawn yt-dlp");
}

export async function runYtDlpJson(args: string[], opts?: { timeoutMs?: number }): Promise<unknown> {
  const timeoutMs = Math.max(1_000, opts?.timeoutMs ?? 60_000);

  return new Promise((resolve, reject) => {
    const child = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    const t = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {}
      reject(new Error(`yt-dlp timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (d) => stdout.push(Buffer.from(d)));
    child.stderr.on("data", (d) => stderr.push(Buffer.from(d)));

    child.on("error", (err: unknown) => {
      clearTimeout(t);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(t);
      const out = Buffer.concat(stdout).toString("utf8").trim();
      const err = Buffer.concat(stderr).toString("utf8").trim();
      if (code !== 0) {
        reject(new Error(err || `yt-dlp exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(out));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        reject(new Error(`failed to parse yt-dlp JSON: ${msg}`));
      }
    });
  });
}
