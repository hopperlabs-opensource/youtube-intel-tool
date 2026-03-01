export function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms));
  const s = Math.floor(total / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  return `${m}:${String(ss).padStart(2, "0")}`;
}

export function padRight(s: string, n: number): string {
  if (s.length >= n) return s;
  return s + " ".repeat(n - s.length);
}

export function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  if (n <= 3) return s.slice(0, Math.max(0, n));
  return s.slice(0, Math.max(0, n - 3)) + "...";
}

type TableValue = string | number | boolean | null | undefined;

function asCell(value: TableValue): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

export function printTable(rows: Array<Record<string, TableValue>>): void {
  if (rows.length === 0) return;
  const cols = Object.keys(rows[0] ?? {});
  const widths = new Map<string, number>();
  for (const c of cols) widths.set(c, c.length);
  for (const r of rows) {
    for (const c of cols) widths.set(c, Math.max(widths.get(c) ?? 0, asCell(r[c]).length));
  }
  const header = cols.map((c) => padRight(c, widths.get(c) ?? c.length)).join("  ");
  const sep = cols.map((c) => "-".repeat(widths.get(c) ?? c.length)).join("  ");
  console.log(header);
  console.log(sep);
  for (const r of rows) console.log(cols.map((c) => padRight(asCell(r[c]), widths.get(c) ?? 0)).join("  "));
}
