export type SseEvent = { type: string; [k: string]: unknown };

export async function* readSse(res: Response): AsyncGenerator<SseEvent, void, void> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });

    while (true) {
      const idx = buf.indexOf("\n\n");
      if (idx === -1) break;
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx + 2);

      // Only support the "data: <json>" lines we emit server-side.
      const line = raw
        .split("\n")
        .map((l) => l.trimEnd())
        .find((l) => l.startsWith("data: "));
      if (!line) continue;
      const payload = line.slice("data: ".length);
      try {
        const ev = JSON.parse(payload) as SseEvent;
        yield ev;
      } catch {
        // Ignore malformed events.
      }
    }
  }
}

