import net from "node:net";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function loadDotEnv(filePath) {
  try {
    const txt = fs.readFileSync(filePath, "utf8");
    const out = {};
    for (const raw of txt.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2] ?? "";
      if ((val.startsWith('"') && val.endsWith('"') && val.length >= 2) || (val.startsWith("'") && val.endsWith("'") && val.length >= 2)) {
        val = val.slice(1, -1);
      }
      out[key] = val;
    }
    return out;
  } catch {
    return {};
  }
}

function cleanupStaleNextLock(appDir) {
  const lockPath = path.join(appDir, ".next/dev/lock");
  if (!fs.existsSync(lockPath)) return;
  try {
    const raw = fs.readFileSync(lockPath, "utf8").trim();
    const pid = Number(raw);
    if (Number.isFinite(pid) && pid > 0) {
      try {
        process.kill(pid, 0);
        return;
      } catch {
        // Process is gone; safe to remove stale lock.
      }
    }
    fs.unlinkSync(lockPath);
    console.warn(`warn: removed stale Next lock at ${lockPath}`);
  } catch {
    // Ignore: if this fails, Next will report the lock state.
  }
}

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const appRoot = path.resolve(here, "..");
const dotEnvExample = loadDotEnv(path.join(repoRoot, ".env.example"));
const dotEnv = loadDotEnv(path.join(repoRoot, ".env"));
const mergedEnv = { ...dotEnvExample, ...dotEnv, ...process.env };

async function isPortFree(port) {
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "0.0.0.0");
  });
}

async function isHealthy(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForHealthy(baseUrl, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 30000;
  const intervalMs = opts.intervalMs ?? 100;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isHealthy(baseUrl)) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

async function pickPort(startPort, maxTries = 20) {
  for (let i = 0; i < maxTries; i++) {
    const p = startPort + i;
    if (await isPortFree(p)) return p;
  }
  return startPort;
}

const defaultPort = Number(dotEnvExample.YIT_KARAOKE_PORT || 48334);
const desired = Number(mergedEnv.KARAOKE_WEB_PORT || mergedEnv.WEB_PORT || mergedEnv.PORT || mergedEnv.YIT_KARAOKE_PORT || defaultPort);
const port = Number.isFinite(desired) ? await pickPort(desired) : await pickPort(defaultPort);
if (port !== desired) {
  console.warn(`warn: KARAOKE_WEB_PORT ${desired} in use; using ${port}`);
}
console.log(`karaoke-web: http://localhost:${port}`);
const baseUrl = `http://localhost:${port}`;

cleanupStaleNextLock(appRoot);

const child = spawn(process.platform === "win32" ? "next.cmd" : "next", ["dev", "--webpack", "-p", String(port)], {
  stdio: "inherit",
  env: { ...mergedEnv, KARAOKE_WEB_PORT: String(port), PORT: String(port), WEB_PORT: String(port) },
});

const exitCodeP = new Promise((resolve) => {
  child.once("exit", (code) => resolve(code ?? 0));
});

const ready = await Promise.race([waitForHealthy(baseUrl), exitCodeP.then(() => false)]);
if (ready) {
  try {
    fs.writeFileSync(
      path.join(repoRoot, ".yit-karaoke-dev.json"),
      JSON.stringify({ base_url: baseUrl, web_port: port, updated_at: new Date().toISOString() }, null, 2) + "\n",
      "utf8"
    );
  } catch {
    // Ignore.
  }
}

process.exit(await exitCodeP);
