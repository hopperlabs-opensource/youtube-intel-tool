export type ParsedYouTubeUrl = { provider_video_id: string };

const EXACT_YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.+$/g, "");
}

function parseVideoId(raw: string | null | undefined): string | null {
  const id = String(raw || "").trim();
  if (!id) return null;
  return VIDEO_ID_RE.test(id) ? id : null;
}

export function isYouTubeHost(hostname: string): boolean {
  const host = normalizeHost(hostname);
  if (!host) return false;
  if (EXACT_YOUTUBE_HOSTS.has(host)) return true;
  return host.endsWith(".youtube.com") || host.endsWith(".youtube-nocookie.com");
}

export function isYouTubeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return isYouTubeHost(u.hostname);
  } catch {
    return false;
  }
}

export function assertYouTubeUrl(url: string): URL {
  const u = new URL(url);
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("URL must use http or https");
  }
  if (!isYouTubeHost(u.hostname)) {
    throw new Error("URL must be a YouTube URL");
  }
  return u;
}

export function parseYouTubeUrl(url: string): ParsedYouTubeUrl {
  const u = assertYouTubeUrl(url);
  const host = normalizeHost(u.hostname);

  // https://www.youtube.com/watch?v=VIDEO_ID
  const v = parseVideoId(u.searchParams.get("v"));
  if (v) return { provider_video_id: v };

  // https://youtu.be/VIDEO_ID
  if (host === "youtu.be" || host === "www.youtu.be") {
    const id = parseVideoId(u.pathname.replace(/^\//, "").split("/")[0]);
    if (id) return { provider_video_id: id };
  }

  // https://www.youtube.com/embed/VIDEO_ID
  // https://www.youtube.com/shorts/VIDEO_ID
  // https://www.youtube.com/live/VIDEO_ID
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length >= 2) {
    const kind = parts[0]?.toLowerCase();
    if (kind === "embed" || kind === "shorts" || kind === "live" || kind === "v") {
      const id = parseVideoId(parts[1]);
      if (id) return { provider_video_id: id };
    }
  }

  throw new Error("Unsupported YouTube URL format");
}

type YouTubeOEmbed = {
  title: string;
  author_name?: string;
  author_url?: string;
  thumbnail_url?: string;
};

export async function fetchYouTubeOEmbed(input: { url: string; timeoutMs?: number }): Promise<YouTubeOEmbed | null> {
  const controller = new AbortController();
  const timeoutMs = Math.max(250, input.timeoutMs ?? 1500);
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const youtubeUrl = assertYouTubeUrl(input.url).toString();
    const endpoint = new URL("https://www.youtube.com/oembed");
    endpoint.searchParams.set("url", youtubeUrl);
    endpoint.searchParams.set("format", "json");

    const res = await fetch(endpoint, {
      method: "GET",
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as unknown;
    if (!json || typeof json !== "object") return null;
    const obj = json as Record<string, unknown>;
    const title = typeof obj.title === "string" ? obj.title : null;
    const author_name = typeof obj.author_name === "string" ? obj.author_name : undefined;
    const author_url = typeof obj.author_url === "string" ? obj.author_url : undefined;
    const thumbnail_url = typeof obj.thumbnail_url === "string" ? obj.thumbnail_url : undefined;
    if (!title || !title.trim()) return null;
    return {
      title: title.trim(),
      author_name: author_name?.trim() || undefined,
      author_url: author_url?.trim() || undefined,
      thumbnail_url: thumbnail_url?.trim() || undefined,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
