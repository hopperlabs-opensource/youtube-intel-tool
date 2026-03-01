export const KARAOKE_UI_TOKENS = {
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
  },
  spacing: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 20,
  },
  fontSize: {
    caption: 12,
    body: 14,
    title: 24,
  },
} as const;

export type KaraokeUiTokens = typeof KARAOKE_UI_TOKENS;
