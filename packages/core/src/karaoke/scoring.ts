export type KaraokeTimingBand = {
  max_error_ms: number;
  base_points: number;
};

export const KARAOKE_TIMING_BANDS: KaraokeTimingBand[] = [
  { max_error_ms: 500, base_points: 100 },
  { max_error_ms: 1200, base_points: 70 },
  { max_error_ms: 2500, base_points: 40 },
  { max_error_ms: Number.MAX_SAFE_INTEGER, base_points: 10 },
];

export function scoreBaseByTimingError(timingErrorMs: number): number {
  const safe = Math.max(0, Math.floor(timingErrorMs));
  for (const band of KARAOKE_TIMING_BANDS) {
    if (safe <= band.max_error_ms) return band.base_points;
  }
  return 10;
}

export function streakBonus(streakCount: number): number {
  const safe = Math.max(0, Math.floor(streakCount));
  // +5 per streak step, capped at +30.
  return Math.min(30, safe * 5);
}

export function awardPoints(input: {
  expected_at_ms: number;
  actual_at_ms: number;
  current_streak: number;
}): { timing_error_ms: number; base_points: number; streak_bonus: number; awarded_points: number } {
  const expected = Math.max(0, Math.floor(input.expected_at_ms));
  const actual = Math.max(0, Math.floor(input.actual_at_ms));
  const timing_error_ms = Math.abs(actual - expected);
  const base_points = scoreBaseByTimingError(timing_error_ms);
  const streak_bonus = streakBonus(input.current_streak);
  const awarded_points = Math.max(0, base_points + streak_bonus);
  return { timing_error_ms, base_points, streak_bonus, awarded_points };
}
