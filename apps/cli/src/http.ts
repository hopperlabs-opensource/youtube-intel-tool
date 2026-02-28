import { ApiErrorSchema } from "@yt/contracts";
import { getYitDefault } from "@yt/core";
import type { z } from "zod";
import fs from "node:fs";
import path from "node:path";

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) throw new Error("baseUrl is empty");
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

export class HttpError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, opts: { status: number; code?: string; details?: unknown }) {
    super(message);
    this.name = "HttpError";
    this.status = opts.status;
    this.code = opts.code;
    this.details = opts.details;
  }
}

export type ApiClient = {
  baseUrl: string;
  headers?: Record<string, string>;
};

function readDevBaseUrl(): string | null {
  // Best-effort: when running `pnpm dev`, the web dev script writes `.yit-dev.json` at repo root.
  const maxUp = 6;
  let dir = process.cwd();
  for (let i = 0; i < maxUp; i++) {
    const p = path.join(dir, ".yit-dev.json");
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, "utf8");
        const json = JSON.parse(raw) as any;
        const u = typeof json?.base_url === "string" ? json.base_url.trim() : "";
        if (u) return u;
      }
    } catch {}
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function makeApiClient(input?: { baseUrl?: string; headers?: Record<string, string> }): ApiClient {
  const baseUrl = normalizeBaseUrl(
    input?.baseUrl ?? process.env.YIT_BASE_URL ?? readDevBaseUrl() ?? getYitDefault("YIT_BASE_URL")
  );
  return { baseUrl, headers: input?.headers };
}

async function parseError(res: Response): Promise<HttpError> {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const json = await res.json().catch(() => null);
    const parsed = ApiErrorSchema.safeParse(json);
    if (parsed.success) {
      const e = parsed.data.error;
      return new HttpError(e.message, { status: res.status, code: e.code, details: e.details });
    }
    return new HttpError(`HTTP ${res.status}`, { status: res.status, details: json });
  }
  const text = await res.text().catch(() => "");
  return new HttpError(text || `HTTP ${res.status}`, { status: res.status });
}

export async function apiJson<TSchema extends z.ZodTypeAny>(opts: {
  client: ApiClient;
  method: "GET" | "POST" | "PATCH";
  path: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  schema: TSchema;
}): Promise<{ data: z.infer<TSchema>; res: Response }> {
  const url = new URL(opts.client.baseUrl + opts.path);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v === undefined || v === null) continue;
    url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, {
    method: opts.method,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(opts.client.headers ?? {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });

  if (!res.ok) throw await parseError(res);
  const json = await res.json();
  const data = opts.schema.parse(json);
  return { data, res };
}

export async function apiText(opts: {
  client: ApiClient;
  method: "GET";
  path: string;
  query?: Record<string, string | number | boolean | null | undefined>;
}): Promise<{ text: string; res: Response }> {
  const url = new URL(opts.client.baseUrl + opts.path);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v === undefined || v === null) continue;
    url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, {
    method: opts.method,
    headers: { accept: "text/plain, text/vtt, */*", ...(opts.client.headers ?? {}) },
  });
  if (!res.ok) throw await parseError(res);
  const text = await res.text();
  return { text, res };
}
