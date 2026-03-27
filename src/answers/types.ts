import type { QuestionType } from "../questions/types.js";

export type AnswerStrategy = "deterministic" | "resume-derived" | "generated" | "needs-review";
export type AnswerConfidence = "high" | "medium" | "low" | "manual_review";

export interface ResolvedAnswer {
  questionType: QuestionType;
  strategy: AnswerStrategy;
  answer: string | string[] | boolean | null;
  confidence: number;
  confidenceLabel: AnswerConfidence;
  source: "candidate-profile" | "resume" | "llm" | "manual";
  notes?: string[];
}
