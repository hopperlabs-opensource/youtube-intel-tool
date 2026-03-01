/**
 * Parse frame timestamps from ffmpeg showinfo filter stderr output.
 * The showinfo filter outputs lines like:
 *   [Parsed_showinfo_1 @ 0x...] n:   0 pts:  12345 pts_time:1.234
 */

export interface ParsedFrameInfo {
  /** Frame number from ffmpeg */
  n: number;
  /** Presentation timestamp in milliseconds */
  timestampMs: number;
}

const SHOWINFO_RE = /\bn:\s*(\d+)\b.*\bpts_time:\s*([\d.]+)/;

export function parseShowInfoLine(line: string): ParsedFrameInfo | null {
  const match = SHOWINFO_RE.exec(line);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  const ptsTime = parseFloat(match[2]);
  if (!Number.isFinite(n) || !Number.isFinite(ptsTime)) return null;
  return {
    n,
    timestampMs: Math.round(ptsTime * 1000),
  };
}

export function parseAllShowInfo(stderr: string): ParsedFrameInfo[] {
  const results: ParsedFrameInfo[] = [];
  for (const line of stderr.split("\n")) {
    const info = parseShowInfoLine(line);
    if (info) results.push(info);
  }
  return results.sort((a, b) => a.timestampMs - b.timestampMs);
}
