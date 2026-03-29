import type { JobPosting } from "@prisma/client";
import type { CandidateProfile } from "../candidate/types.js";
import { buildAnswerBank } from "./answerBank.js";
import { persistResolvedAnswer, readCachedResolvedAnswer } from "./cache.js";
import { classifyQuestion } from "../questions/classifyQuestion.js";
import { resolveAiFallbackAnswer } from "../questions/strategies/aiFallback.js";
import { resolveDeterministicAnswer } from "../questions/strategies/deterministic.js";
import { resolveGeneratedAnswer } from "../questions/strategies/generated.js";
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

function needsAiFallback(answer: ResolvedAnswer | null | undefined): boolean {
  return answer?.strategy === "needs-review" || answer?.confidenceLabel === "manual_review";
}

export async function resolveAnswer(input: {
  question: InputQuestion;
  candidateProfile: CandidateProfile;
  job?: Pick<JobPosting, "title" | "company" | "location"> | null;
}): Promise<ResolvedAnswer> {
  const classified = classifyQuestion(input.question);
  const cached = await readCachedResolvedAnswer(classified);
  if (cached) {
    return {
      questionType: cached.questionType as ResolvedAnswer["questionType"],
      strategy: cached.strategy,
      answer: cached.answer,
      confidence: 1,
      confidenceLabel: cached.confidenceLabel,
      source: cached.source,
      ...(cached.notes ? { notes: cached.notes } : {}),
    };
  }

  const answerBank = buildAnswerBank(input.candidateProfile);

  const bankHit = answerBank[classified.type];
  if (bankHit && !needsAiFallback(bankHit)) {
    return finalizeResolvedAnswer({
      ...input,
      classified,
      resolved: bankHit,
    });
  }

  const deterministic = resolveDeterministicAnswer(classified, input.candidateProfile);
  if (deterministic && !needsAiFallback(deterministic)) {
    return finalizeResolvedAnswer({
      ...input,
      classified,
      resolved: deterministic,
    });
  }

  const resumeAware = resolveResumeAwareAnswer(classified, input.candidateProfile);
  if (resumeAware && !needsAiFallback(resumeAware)) {
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

  const aiFallback = await resolveAiFallbackAnswer({
    question: input.question,
    classified,
    candidateProfile: input.candidateProfile,
    previousAttempt: bankHit ?? deterministic ?? resumeAware ?? null,
    ...(input.job !== undefined ? { job: input.job } : {}),
  });

  return finalizeResolvedAnswer({
    ...input,
    classified,
    resolved: aiFallback,
  });
}
