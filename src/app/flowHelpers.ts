import type { Page } from "@playwright/test";
import type { CandidateProfile } from "../candidate/types.js";
import type { InputQuestion } from "../questions/types.js";
import { buildDuplicateReviewReason, getLatestJobReview } from "../utils/jobHistory.js";
import { LINKEDIN_EVALUATION_SESSION_OPTIONS, PARSE_VERSION } from "./constants.js";
import type { AppDeps } from "./deps.js";
import { persistJobHistory, persistSystemEvent } from "./observability.js";

export async function loadMasterProfileForArgs(
  args: { resumePath: string; linkedinUrl?: string },
  deps: AppDeps,
) {
  return deps.loadCandidateMasterProfile({
    resumePath: args.resumePath,
    ...(args.linkedinUrl ? { linkedinUrl: args.linkedinUrl } : {}),
  });
}

export function createCandidateAnswerResolver(
  candidateProfile: CandidateProfile,
  deps: AppDeps,
) {
  return ({
    question,
    candidateProfile: profileOverride,
  }: {
    question: InputQuestion;
    candidateProfile: CandidateProfile;
  }) =>
    deps.resolveAnswer({
      question,
      candidateProfile: profileOverride ?? candidateProfile,
    });
}

export function createBatchJobEvaluator(args: {
  disableAiEvaluation: boolean;
  scoreThreshold: number;
  scoringProfile: Awaited<ReturnType<AppDeps["loadCandidateProfile"]>>;
  evaluationPage?: Page;
  deps: AppDeps;
}) {
  const deps = args.deps;

  if (args.disableAiEvaluation) {
    return async (_url: string) => ({
      shouldApply: true,
      finalDecision: "APPLY" as const,
      score: 0,
      reason: "AI evaluation disabled for this batch run.",
      policyAllowed: true,
    });
  }

  const evaluateOnPage = async (evaluationPage: Page, url: string) => {
    const latestReview = await getLatestJobReview({
      prisma: deps.prisma,
      jobUrl: url,
    });

    if (latestReview) {
      const reason = buildDuplicateReviewReason(latestReview);
      deps.logger.warn({ url, reason }, "Skipping duplicate job review");
      await persistSystemEvent(
        {
          level: "WARN",
          scope: "linkedin.batch",
          message: "Skipping duplicate job review.",
          runType: "easy-apply-batch",
          jobUrl: url,
          details: {
            previousStatus: latestReview.status,
            previousDecision: latestReview.decision,
            previousScore: latestReview.score,
          },
        },
        deps,
      );

      return {
        shouldApply: false,
        finalDecision: "SKIP" as const,
        score: latestReview.score ?? 0,
        reason,
        policyAllowed: latestReview.policyAllowed ?? true,
      };
    }

    const extracted = await deps.extractJobText(evaluationPage, url);
    const llmInput = deps.formatJobForLLM(extracted);
    const parseResult = await deps.parseJob(llmInput);
    const normalized = deps.normalizeParsedJob(parseResult.parsed, extracted);
    const score = deps.scoreJob(normalized, args.scoringProfile);
    const policy = deps.evaluatePolicy(normalized, args.scoringProfile);
    const meetsThreshold = score.totalScore >= args.scoreThreshold;
    const finalDecision: "APPLY" | "SKIP" =
      policy.allowed && meetsThreshold ? "APPLY" : "SKIP";
    const reason = !policy.allowed
      ? policy.reasons.join(" ")
      : meetsThreshold
        ? `Score ${score.totalScore} meets the configured threshold of ${args.scoreThreshold}.`
        : `Score ${score.totalScore} is below the configured threshold of ${args.scoreThreshold}.`;

    deps.logger.info(
      {
        url,
        finalDecision,
        totalScore: score.totalScore,
        policyAllowed: policy.allowed,
        scoreThreshold: args.scoreThreshold,
        reasons: !policy.allowed ? policy.reasons : [reason],
      },
      "LinkedIn Easy Apply job evaluated",
    );

    await persistJobHistory(
      {
        jobUrl: url,
        source: "easy-apply-batch",
        status: finalDecision === "APPLY" ? "EVALUATED" : "SKIPPED",
        score: score.totalScore,
        threshold: args.scoreThreshold,
        decision: finalDecision,
        policyAllowed: policy.allowed,
        reasons: !policy.allowed ? policy.reasons : [reason],
        summary: reason,
        ...(normalized.platform ? { platform: normalized.platform } : {}),
        details: {
          shouldApply: finalDecision === "APPLY",
          parseVersion: PARSE_VERSION,
        },
      },
      deps,
    );

    return {
      shouldApply: finalDecision === "APPLY",
      finalDecision,
      score: score.totalScore,
      reason,
      policyAllowed: policy.allowed,
    };
  };

  if (args.evaluationPage) {
    return async (url: string) => evaluateOnPage(args.evaluationPage as Page, url);
  }

  return async (url: string) =>
    deps.withPage(
      LINKEDIN_EVALUATION_SESSION_OPTIONS,
      async (evaluationPage) => evaluateOnPage(evaluationPage, url),
    );
}
