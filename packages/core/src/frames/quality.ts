/**
 * Quality gates and confidence scoring for frame analyses.
 * Pattern from klippbok (caption quality auditing) and VideoFinder (confidence scoring).
 *
 * Scores each analysis on multiple dimensions:
 * - Description length and specificity
 * - Object detection with confidence values
 * - Text extraction success
 * - Scene type classification confidence
 *
 * Provides quality gates to filter/re-analyze low-quality results.
 */

import type { FrameAnalysis } from "./analyze";

export interface QualityScore {
  /** Frame index */
  frameIndex: number;
  /** Overall quality score 0.0 - 1.0 */
  overall: number;
  /** Description quality: length, specificity, uniqueness */
  descriptionScore: number;
  /** Object detection quality: presence and confidence */
  objectScore: number;
  /** Whether meaningful text was extracted */
  textScore: number;
  /** Whether scene type was classified */
  classificationScore: number;
  /** Issues identified */
  issues: string[];
}

export interface QualityGateOpts {
  /** Minimum overall quality score to pass (default 0.3) */
  minOverallScore?: number;
  /** Minimum description length in words to be considered quality (default 8) */
  minDescriptionWords?: number;
  /** Whether to require at least one detected object (default false) */
  requireObjects?: boolean;
}

/**
 * Score the quality of a frame analysis.
 */
export function scoreAnalysis(analysis: FrameAnalysis): QualityScore {
  const issues: string[] = [];
  let descriptionScore = 0;
  let objectScore = 0;
  let textScore = 0;
  let classificationScore = 0;

  // Description scoring (0.0 - 1.0)
  const words = analysis.description.split(/\s+/).filter(Boolean);
  const uniqueWords = new Set(words.map((w) => w.toLowerCase()));
  const wordCount = words.length;

  if (wordCount === 0) {
    descriptionScore = 0;
    issues.push("empty_description");
  } else if (wordCount < 5) {
    descriptionScore = 0.1;
    issues.push("very_short_description");
  } else if (wordCount < 10) {
    descriptionScore = 0.3;
    issues.push("short_description");
  } else if (wordCount < 20) {
    descriptionScore = 0.6;
  } else {
    descriptionScore = 0.8;
  }

  // Bonus for word diversity (not repetitive)
  const diversity = wordCount > 0 ? uniqueWords.size / wordCount : 0;
  if (diversity < 0.2) {
    descriptionScore *= 0.5;
    issues.push("repetitive_description");
  } else if (diversity > 0.5) {
    descriptionScore = Math.min(1.0, descriptionScore + 0.2);
  }

  // Object scoring (0.0 - 1.0)
  if (analysis.objects.length === 0) {
    objectScore = 0.3; // Acceptable — not all frames have identifiable objects
  } else {
    const avgConfidence =
      analysis.objects.reduce((sum, o) => sum + (o.confidence ?? 0.5), 0) / analysis.objects.length;
    objectScore = Math.min(1.0, 0.5 + avgConfidence * 0.5);
  }

  // Text extraction scoring (0.0 - 1.0)
  if (analysis.textOverlay && analysis.textOverlay.trim().length > 0) {
    const textLen = analysis.textOverlay.trim().length;
    textScore = textLen > 50 ? 1.0 : textLen > 10 ? 0.7 : 0.4;
  } else {
    textScore = 0.3; // Acceptable — not all frames have text
  }

  // Classification scoring (0.0 - 1.0)
  if (analysis.sceneType) {
    classificationScore = 0.8;
  } else {
    classificationScore = 0.2;
    issues.push("no_scene_classification");
  }

  // Generic/vague description detection
  const vaguePatterns = [
    /a (person|man|woman|figure) (is |stands? |sits? )/i,
    /the (screen|frame|image|video) (shows?|displays?|contains?)/i,
    /nothing (significant|notable|interesting)/i,
    /cannot (see|determine|identify)/i,
  ];
  for (const pattern of vaguePatterns) {
    if (pattern.test(analysis.description)) {
      descriptionScore *= 0.8;
      if (!issues.includes("vague_description")) {
        issues.push("vague_description");
      }
    }
  }

  // Overall weighted score
  const overall = Math.round(
    (descriptionScore * 0.5 + objectScore * 0.2 + textScore * 0.15 + classificationScore * 0.15) * 100,
  ) / 100;

  return {
    frameIndex: analysis.frameIndex,
    overall,
    descriptionScore: Math.round(descriptionScore * 100) / 100,
    objectScore: Math.round(objectScore * 100) / 100,
    textScore: Math.round(textScore * 100) / 100,
    classificationScore: Math.round(classificationScore * 100) / 100,
    issues,
  };
}

/**
 * Apply quality gates to a set of frame analyses.
 * Returns analyses that pass the quality threshold and those that failed.
 */
export function applyQualityGates(
  analyses: FrameAnalysis[],
  opts?: QualityGateOpts,
): {
  passed: FrameAnalysis[];
  failed: Array<{ analysis: FrameAnalysis; score: QualityScore }>;
  scores: QualityScore[];
} {
  const minOverall = opts?.minOverallScore ?? 0.3;
  const minWords = opts?.minDescriptionWords ?? 8;
  const requireObjects = opts?.requireObjects ?? false;

  const passed: FrameAnalysis[] = [];
  const failed: Array<{ analysis: FrameAnalysis; score: QualityScore }> = [];
  const scores: QualityScore[] = [];

  for (const analysis of analyses) {
    const score = scoreAnalysis(analysis);
    scores.push(score);

    const words = analysis.description.split(/\s+/).filter(Boolean);
    const passesOverall = score.overall >= minOverall;
    const passesWords = words.length >= minWords;
    const passesObjects = !requireObjects || analysis.objects.length > 0;

    if (passesOverall && passesWords && passesObjects) {
      passed.push(analysis);
    } else {
      failed.push({ analysis, score });
    }
  }

  return { passed, failed, scores };
}

/**
 * Compute aggregate quality metrics for a set of analyses.
 */
export function computeQualityReport(scores: QualityScore[]): {
  totalFrames: number;
  averageScore: number;
  highQuality: number;
  mediumQuality: number;
  lowQuality: number;
  commonIssues: Array<{ issue: string; count: number; percentage: number }>;
} {
  if (scores.length === 0) {
    return {
      totalFrames: 0,
      averageScore: 0,
      highQuality: 0,
      mediumQuality: 0,
      lowQuality: 0,
      commonIssues: [],
    };
  }

  const totalFrames = scores.length;
  const averageScore = Math.round(
    (scores.reduce((sum, s) => sum + s.overall, 0) / totalFrames) * 100,
  ) / 100;

  const highQuality = scores.filter((s) => s.overall >= 0.7).length;
  const mediumQuality = scores.filter((s) => s.overall >= 0.4 && s.overall < 0.7).length;
  const lowQuality = scores.filter((s) => s.overall < 0.4).length;

  // Count common issues
  const issueCounts = new Map<string, number>();
  for (const score of scores) {
    for (const issue of score.issues) {
      issueCounts.set(issue, (issueCounts.get(issue) ?? 0) + 1);
    }
  }

  const commonIssues = Array.from(issueCounts.entries())
    .map(([issue, count]) => ({
      issue,
      count,
      percentage: Math.round((count / totalFrames) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  return { totalFrames, averageScore, highQuality, mediumQuality, lowQuality, commonIssues };
}
