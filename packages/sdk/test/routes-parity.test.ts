import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SDK_ROUTE_COVERAGE } from "../src/routes";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../..");
const API_ROOT = path.join(REPO_ROOT, "apps", "web", "app", "api");
const ROUTE_SUFFIX = `${path.sep}route.ts`;

function walkRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const next = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkRouteFiles(next));
      continue;
    }
    if (entry.isFile() && next.endsWith(ROUTE_SUFFIX)) out.push(next);
  }
  return out;
}

function normalizeRoutePath(filePath: string): string {
  const rel = path.relative(API_ROOT, filePath).replace(/\\/g, "/");
  const base = rel.slice(0, -"/route.ts".length);
  const segs = base
    .split("/")
    .filter(Boolean)
    .map((seg) => {
      const m = seg.match(/^\[(.+)\]$/);
      return m ? `:${m[1]}` : seg;
    });
  return `/api/${segs.join("/")}`;
}

function routeMethods(filePath: string): string[] {
  const src = fs.readFileSync(filePath, "utf8");
  const methods = new Set<string>();
  for (const match of src.matchAll(/export\s+async\s+function\s+(GET|POST|PATCH|PUT|DELETE)\b/g)) {
    methods.add(match[1]);
  }
  return [...methods];
}

function collectApiRoutes(): string[] {
  const files = walkRouteFiles(API_ROOT);
  const out = new Set<string>();
  for (const file of files) {
    const route = normalizeRoutePath(file);
    for (const method of routeMethods(file)) {
      out.add(`${method} ${route}`);
    }
  }
  return [...out].sort();
}

function diff(left: string[], right: string[]): string[] {
  const r = new Set(right);
  return left.filter((v) => !r.has(v)).sort();
}

test("sdk route coverage is in parity with Next.js API routes", () => {
  const discovered = collectApiRoutes();
  const declared = [...SDK_ROUTE_COVERAGE].sort();

  const missingInSdk = diff(discovered, declared);
  const staleInSdk = diff(declared, discovered);

  assert.deepEqual(
    { missingInSdk, staleInSdk },
    { missingInSdk: [], staleInSdk: [] },
    `SDK route coverage drift detected.\nmissingInSdk=${JSON.stringify(missingInSdk, null, 2)}\nstaleInSdk=${JSON.stringify(staleInSdk, null, 2)}`
  );
});
