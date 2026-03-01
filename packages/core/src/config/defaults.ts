import fs from "node:fs";
import path from "node:path";

const BASE_DEFAULTS = {
  YIT_WEB_PORT: "48333",
  YIT_WORKER_METRICS_PORT: "48410",
  YIT_POSTGRES_PORT: "48432",
  YIT_REDIS_PORT: "48379",
  YIT_PROMETHEUS_PORT: "49092",
  YIT_GRAFANA_PORT: "48300",
  OLLAMA_BASE_URL: "http://127.0.0.1:11434",
  OPENAI_BASE_URL: "https://api.openai.com",
} as const;

type BaseDefaultKey = keyof typeof BASE_DEFAULTS;

export type YitDefaultKey =
  | BaseDefaultKey
  | "YIT_BASE_URL"
  | "METRICS_PORT"
  | "DATABASE_URL"
  | "REDIS_URL";

type ResolvedDefaults = Record<YitDefaultKey, string>;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    const key = m[1];
    let value = m[2] ?? "";
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function findUp(startDir: string, fileName: string, maxDepth = 8): string | null {
  let dir = startDir;
  for (let i = 0; i < maxDepth; i++) {
    const candidate = path.join(dir, fileName);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function readDotEnvFile(fileName: string): Record<string, string> {
  const file = findUp(process.cwd(), fileName, 8);
  if (!file) return {};
  try {
    return parseDotEnv(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

let cachedDefaults: ResolvedDefaults | null = null;

function resolveDefaults(): ResolvedDefaults {
  if (cachedDefaults) return cachedDefaults;
  const envExample = readDotEnvFile(".env.example");
  const envLocal = readDotEnvFile(".env");

  const base = {
    YIT_WEB_PORT: clean(envLocal.YIT_WEB_PORT) || clean(envExample.YIT_WEB_PORT) || BASE_DEFAULTS.YIT_WEB_PORT,
    YIT_WORKER_METRICS_PORT:
      clean(envLocal.YIT_WORKER_METRICS_PORT) || clean(envExample.YIT_WORKER_METRICS_PORT) || BASE_DEFAULTS.YIT_WORKER_METRICS_PORT,
    YIT_POSTGRES_PORT: clean(envLocal.YIT_POSTGRES_PORT) || clean(envExample.YIT_POSTGRES_PORT) || BASE_DEFAULTS.YIT_POSTGRES_PORT,
    YIT_REDIS_PORT: clean(envLocal.YIT_REDIS_PORT) || clean(envExample.YIT_REDIS_PORT) || BASE_DEFAULTS.YIT_REDIS_PORT,
    YIT_PROMETHEUS_PORT: clean(envLocal.YIT_PROMETHEUS_PORT) || clean(envExample.YIT_PROMETHEUS_PORT) || BASE_DEFAULTS.YIT_PROMETHEUS_PORT,
    YIT_GRAFANA_PORT: clean(envLocal.YIT_GRAFANA_PORT) || clean(envExample.YIT_GRAFANA_PORT) || BASE_DEFAULTS.YIT_GRAFANA_PORT,
    OLLAMA_BASE_URL: clean(envLocal.OLLAMA_BASE_URL) || clean(envExample.OLLAMA_BASE_URL) || BASE_DEFAULTS.OLLAMA_BASE_URL,
    OPENAI_BASE_URL: clean(envLocal.OPENAI_BASE_URL) || clean(envExample.OPENAI_BASE_URL) || BASE_DEFAULTS.OPENAI_BASE_URL,
  };

  cachedDefaults = {
    ...base,
    YIT_BASE_URL: clean(envLocal.YIT_BASE_URL) || clean(envExample.YIT_BASE_URL) || `http://localhost:${base.YIT_WEB_PORT}`,
    METRICS_PORT: clean(envLocal.METRICS_PORT) || clean(envExample.METRICS_PORT) || base.YIT_WORKER_METRICS_PORT,
    DATABASE_URL:
      clean(envLocal.DATABASE_URL) ||
      clean(envExample.DATABASE_URL) ||
      `postgresql://postgres:postgres@127.0.0.1:${base.YIT_POSTGRES_PORT}/youtube_intel`,
    REDIS_URL: clean(envLocal.REDIS_URL) || clean(envExample.REDIS_URL) || `redis://127.0.0.1:${base.YIT_REDIS_PORT}`,
  };
  return cachedDefaults;
}

export function getYitDefault(key: YitDefaultKey): string {
  return resolveDefaults()[key];
}

export function getYitDefaultNumber(key: YitDefaultKey, fallback: number): number {
  const raw = getYitDefault(key);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}
