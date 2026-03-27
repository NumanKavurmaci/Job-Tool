import type { AnswerConfidence } from "./types.js";

export function labelConfidence(
  confidence: number,
  manualReview = false,
): AnswerConfidence {
  if (manualReview) {
    return "manual_review";
  }

  if (confidence >= 0.85) {
    return "high";
  }

  if (confidence >= 0.6) {
    return "medium";
  }

  return "low";
}
