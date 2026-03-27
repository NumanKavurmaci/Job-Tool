import type { ResolvedAnswer } from "../../answers/types.js";
import { labelConfidence } from "../../answers/confidence.js";
import type { ClassifiedQuestion } from "../types.js";

export function resolveManualReview(question: ClassifiedQuestion): ResolvedAnswer {
  return {
    questionType: question.type,
    strategy: "needs-review",
    answer: null,
    confidence: 0,
    confidenceLabel: labelConfidence(0, true),
    source: "manual",
    notes: ["Human review required before using this answer."],
  };
}
