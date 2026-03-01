import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
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

function pythonHasTranscriptApi(pythonBin) {
  if (!pythonBin) return false;
  const check = spawnSync(pythonBin, ["-c", "import youtube_transcript_api"], {
    stdio: "ignore",
  });
  return check.status === 0;
}

function resolveWorkerPythonEnv(env) {
  const configured = env.YIT_PYTHON_BIN || env.PYTHON_BIN || "";
  if (configured && pythonHasTranscriptApi(configured)) {
    return { YIT_PYTHON_BIN: configured, PYTHON_BIN: configured };
  }

  const ensureScript = path.join(repoRoot, "ops/tests/ensure_py_deps.sh");
  if (!fs.existsSync(ensureScript)) return {};

  const ensured = spawnSync("bash", [ensureScript], {
    cwd: repoRoot,
    env: { ...process.env, YIT_PYTHON_BIN: configured || process.env.YIT_PYTHON_BIN || "" },
    encoding: "utf8",
  });
  if (ensured.status !== 0) {
    return {};
  }
  const ensuredBin = ensured.stdout.trim();
  if (!ensuredBin || !pythonHasTranscriptApi(ensuredBin)) {
    return {};
  }
  if (configured && configured !== ensuredBin) {
    console.warn(`warn: ${configured} is missing youtube_transcript_api; using ${ensuredBin}`);
  }
  return { YIT_PYTHON_BIN: ensuredBin, PYTHON_BIN: ensuredBin };
}

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

async function pickPort(startPort, maxTries = 20) {
  for (let i = 0; i < maxTries; i++) {
    const p = startPort + i;
    // eslint-disable-next-line no-await-in-loop
    if (await isPortFree(p)) return p;
  }
  return startPort;
}

const defaultPort = Number(dotEnvExample.YIT_WORKER_METRICS_PORT || dotEnvExample.METRICS_PORT || 48410);
const desired = Number(mergedEnv.METRICS_PORT || mergedEnv.WORKER_METRICS_PORT || mergedEnv.YIT_WORKER_METRICS_PORT || defaultPort);
const port = Number.isFinite(desired) ? await pickPort(desired) : await pickPort(defaultPort);
if (port !== desired) {
  console.warn(`warn: METRICS_PORT ${desired} in use; using ${port}`);
}
console.log(`worker metrics: http://localhost:${port}/metrics`);
const workerPythonEnv = resolveWorkerPythonEnv(mergedEnv);

const child = spawn(process.platform === "win32" ? "tsx.cmd" : "tsx", ["src/index.ts"], {
  stdio: "inherit",
  env: { ...mergedEnv, ...workerPythonEnv, METRICS_PORT: String(port) },
});

child.on("exit", (code) => process.exit(code ?? 0));
