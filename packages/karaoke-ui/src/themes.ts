import type { KaraokeTheme } from "@yt/contracts";

export type KaraokeThemeToken = {
  id: string;
  className: string;
  primary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
};

export function toThemeToken(theme: KaraokeTheme): KaraokeThemeToken {
  const palette = theme.palette ?? {
    primary: "#f6b73c",
    accent: "#e46f05",
    background: "#0f1114",
    surface: "#1a1f26",
    text: "#f7f8fb",
  };

  return {
    id: theme.id,
    className: theme.class_name,
    primary: palette.primary,
    accent: palette.accent,
    background: palette.background,
    surface: palette.surface,
    text: palette.text,
  };
}
