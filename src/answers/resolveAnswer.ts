import type { JobPosting } from "@prisma/client";
import type { CandidateProfile } from "../candidate/types.js";
import { buildAnswerBank } from "./answerBank.js";
import { persistResolvedAnswer } from "./cache.js";
import { classifyQuestion } from "../questions/classifyQuestion.js";
import { resolveDeterministicAnswer } from "../questions/strategies/deterministic.js";
import { resolveGeneratedAnswer } from "../questions/strategies/generated.js";
import { resolveManualReview } from "../questions/strategies/manualReview.js";
import { resolveResumeAwareAnswer } from "../questions/strategies/resumeAware.js";
import type { InputQuestion } from "../questions/types.js";
import type { ResolvedAnswer } from "./types.js";

async function finalizeResolvedAnswer(input: {
  question: InputQuestion;
  candidateProfile: CandidateProfile;
  classified: ReturnType<typeof classifyQuestion>;
  resolved: ResolvedAnswer;
}): Promise<ResolvedAnswer> {
  await persistResolvedAnswer({
    question: input.question,
    classified: input.classified,
    resolved: input.resolved,
  });

  return input.resolved;
}

export async function resolveAnswer(input: {
  question: InputQuestion;
  candidateProfile: CandidateProfile;
  job?: Pick<JobPosting, "title" | "company" | "location"> | null;
}): Promise<ResolvedAnswer> {
  const classified = classifyQuestion(input.question);
  const answerBank = buildAnswerBank(input.candidateProfile);

  const bankHit = answerBank[classified.type];
  if (bankHit) {
    return finalizeResolvedAnswer({
      ...input,
      classified,
      resolved: bankHit,
    });
  }

  const deterministic = resolveDeterministicAnswer(classified, input.candidateProfile);
  if (deterministic) {
    return finalizeResolvedAnswer({
      ...input,
      classified,
      resolved: deterministic,
    });
  }

  const resumeAware = resolveResumeAwareAnswer(classified, input.candidateProfile);
  if (resumeAware) {
    return finalizeResolvedAnswer({
      ...input,
      classified,
      resolved: resumeAware,
    });
  }

  const generated = await resolveGeneratedAnswer(classified, input.candidateProfile, input.job);
  if (generated) {
    return finalizeResolvedAnswer({
      ...input,
      classified,
      resolved: generated,
    });
  }

  return finalizeResolvedAnswer({
    ...input,
    classified,
    resolved: resolveManualReview(classified),
  });
}
