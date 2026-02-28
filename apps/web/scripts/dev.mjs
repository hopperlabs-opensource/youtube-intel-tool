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
      // Best-effort: strip surrounding quotes.
      if (
        (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
        (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
      ) {
        val = val.slice(1, -1);
      }
      out[key] = val;
    }
    return out;
  } catch {
    return {};
  }
}

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
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

const defaultPort = Number(dotEnvExample.YIT_WEB_PORT || 3333);
const desired = Number(mergedEnv.WEB_PORT || mergedEnv.PORT || mergedEnv.YIT_WEB_PORT || defaultPort);
const port = Number.isFinite(desired) ? await pickPort(desired) : await pickPort(defaultPort);
if (port !== desired) {
  console.warn(`warn: WEB_PORT ${desired} in use; using ${port}`);
}
console.log(`web: http://localhost:${port}`);
const baseUrl = `http://localhost:${port}`;

const child = spawn(process.platform === "win32" ? "next.cmd" : "next", ["dev", "-p", String(port)], {
  stdio: "inherit",
  env: { ...mergedEnv, WEB_PORT: String(port), PORT: String(port) },
});

const exitCodeP = new Promise((resolve) => {
  child.once("exit", (code) => resolve(code ?? 0));
});

// Best-effort: publish the chosen port so the CLI can auto-connect during local dev.
// Wait for the app to actually respond; this avoids writing a stale `.yit-dev.json` when Next exits early
// (e.g., lock contention when another `next dev` is already running).
const ready = await Promise.race([waitForHealthy(baseUrl), exitCodeP.then(() => false)]);
if (ready) {
  try {
    fs.writeFileSync(
      path.join(repoRoot, ".yit-dev.json"),
      JSON.stringify({ base_url: baseUrl, web_port: port, updated_at: new Date().toISOString() }, null, 2) + "\n",
      "utf8"
    );
  } catch {
    // Ignore; dev should still work.
  }
}

process.exit(await exitCodeP);
