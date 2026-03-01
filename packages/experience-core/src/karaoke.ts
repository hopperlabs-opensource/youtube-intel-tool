export type KaraokeUiThemeMode = "theme" | "light" | "dark";

export type KaraokeUiSettings = {
  themeMode: KaraokeUiThemeMode;
  lyricScale: number;
  hideUpcomingTitles: boolean;
};

export const KARAOKE_UI_SETTINGS_KEY = "yit:karaoke_ui_settings_v1";

export const DEFAULT_KARAOKE_UI_SETTINGS: KaraokeUiSettings = {
  themeMode: "theme",
  lyricScale: 1,
  hideUpcomingTitles: false,
};

export function normalizeKaraokeUiSettings(input: unknown): KaraokeUiSettings {
  if (!input || typeof input !== "object") return DEFAULT_KARAOKE_UI_SETTINGS;
  const obj = input as Record<string, unknown>;

  const mode = obj.themeMode;
  const themeMode: KaraokeUiThemeMode = mode === "light" || mode === "dark" || mode === "theme" ? mode : "theme";

  const lyricScaleRaw = Number(obj.lyricScale);
  const lyricScale = Number.isFinite(lyricScaleRaw) ? Math.max(0.8, Math.min(1.6, lyricScaleRaw)) : 1;

  return {
    themeMode,
    lyricScale,
    hideUpcomingTitles: Boolean(obj.hideUpcomingTitles),
  };
}

export function loadKaraokeUiSettings(win: Window = window): KaraokeUiSettings {
  try {
    const raw = win.localStorage.getItem(KARAOKE_UI_SETTINGS_KEY);
    if (!raw) return DEFAULT_KARAOKE_UI_SETTINGS;
    return normalizeKaraokeUiSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_KARAOKE_UI_SETTINGS;
  }
}

export function saveKaraokeUiSettings(settings: KaraokeUiSettings, win: Window = window): void {
  try {
    win.localStorage.setItem(KARAOKE_UI_SETTINGS_KEY, JSON.stringify(normalizeKaraokeUiSettings(settings)));
  } catch {
    // Ignore localStorage failures.
  }
}

export function karaokeJoinPath(token: string): string {
  return `/join/${encodeURIComponent(token.trim())}`;
}
