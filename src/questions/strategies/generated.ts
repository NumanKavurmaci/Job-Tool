import type { CandidateProfile } from "../../candidate/types.js";
import type { JobPosting } from "@prisma/client";
import { generateShortAnswer } from "../../materials/generateShortAnswer.js";
import type { ResolvedAnswer } from "../../answers/types.js";
import { labelConfidence } from "../../answers/confidence.js";
import type { ClassifiedQuestion } from "../types.js";

export async function resolveGeneratedAnswer(
  question: ClassifiedQuestion,
  profile: CandidateProfile,
  job?: Pick<JobPosting, "title" | "company" | "location"> | null,
): Promise<ResolvedAnswer | null> {
  if (question.type !== "motivation_short_text" && question.type !== "general_short_text") {
    return null;
  }

  const answer = await generateShortAnswer({
    question: question.normalizedText,
    candidateProfile: profile,
    ...(job
      ? {
          targetJobContext: {
            title: job.title,
            company: job.company,
            location: job.location,
          },
        }
      : {}),
  });

  return {
    questionType: question.type,
    strategy: "generated",
    answer: answer.text,
    confidence: answer.confidence,
    confidenceLabel: labelConfidence(answer.confidence, answer.confidence < 0.5),
    source: "llm",
    ...(answer.notes ? { notes: answer.notes } : {}),
  };
}
