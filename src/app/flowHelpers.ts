import type { Page } from "@playwright/test";
import type { CandidateProfile } from "../candidate/types.js";
import type { InputQuestion } from "../questions/types.js";
import {
  buildDuplicateReviewReason,
  getLatestJobReview,
  shouldRetryPendingApprovedReview,
  shouldSkipDuplicateBatchReview,
} from "../utils/jobHistory.js";
import { shouldBypassWorkplacePolicy } from "../policy/policyEngine.js";
import {
  jobPostingNeedsMetadataRefresh,
  persistJobAnalysisRecord,
  refreshJobPostingMetadata,
} from "../utils/jobPersistence.js";
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
  useAiScoreAdjustment: boolean;
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

  const retryApprovedJobIfStillOpen = async (evaluationPage: Page, url: string) => {
    const driver = await deps.createEasyApplyDriver(evaluationPage);
    await driver.ensureAuthenticated(url);
    await driver.open(url);

    const alreadyApplied = (await driver.isAlreadyApplied?.()) === true;
    const easyApplyAvailable = await driver.isEasyApplyAvailable();

    return {
      alreadyApplied,
      easyApplyAvailable,
    };
  };

  const evaluateOnPage = async (evaluationPage: Page, url: string) => {
    const latestReview = await getLatestJobReview({
      prisma: deps.prisma,
      jobUrl: url,
      logger: deps.logger,
    });

    if (latestReview && shouldSkipDuplicateBatchReview(latestReview)) {
      const existingJobPosting = deps.prisma.jobPosting.findUnique
        ? await deps.prisma.jobPosting.findUnique({
            where: { url },
            select: {
              id: true,
              title: true,
              company: true,
              companyLogoUrl: true,
              companyLinkedinUrl: true,
              location: true,
            },
          })
        : null;

      if (existingJobPosting && jobPostingNeedsMetadataRefresh(existingJobPosting)) {
        const extracted = await deps.extractJobText(evaluationPage, url);
        await refreshJobPostingMetadata({
          prisma: deps.prisma as never,
          logger: deps.logger,
          url,
          extracted,
        });
      }

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

    if (latestReview && shouldRetryPendingApprovedReview(latestReview)) {
      const pendingState = await retryApprovedJobIfStillOpen(evaluationPage, url);

      if (!pendingState.alreadyApplied && pendingState.easyApplyAvailable) {
        const reason =
          "Job was previously approved and Easy Apply is still available, so the application flow will be retried.";

        deps.logger.info(
          {
            url,
            previousStatus: latestReview.status,
            previousDecision: latestReview.decision,
            previousScore: latestReview.score,
          },
          "Retrying previously approved Easy Apply job",
        );
        await persistSystemEvent(
          {
            level: "INFO",
            scope: "linkedin.batch",
            message: "Retrying previously approved Easy Apply job.",
            runType: "easy-apply-batch",
            jobUrl: url,
            details: {
              previousStatus: latestReview.status,
              previousDecision: latestReview.decision,
              easyApplyAvailable: true,
            },
          },
          deps,
        );

        return {
          shouldApply: true,
          finalDecision: "APPLY" as const,
          score: latestReview.score ?? 0,
          reason,
          policyAllowed: latestReview.policyAllowed ?? true,
        };
      }
    }

    const extracted = await deps.extractJobText(evaluationPage, url);
    const llmInput = deps.formatJobForLLM(extracted);
    const parseResult = await deps.parseJob(llmInput);
    const normalized = deps.normalizeParsedJob(parseResult.parsed, extracted);
    const score = args.useAiScoreAdjustment
      ? await deps.scoreJobWithAi({
          job: normalized,
          profile: args.scoringProfile,
          completePrompt: deps.completePrompt,
          logger: deps.logger,
        })
      : deps.scoreJob(normalized, args.scoringProfile);
    const policy = deps.evaluatePolicy(normalized, args.scoringProfile);
    const meetsThreshold = score.totalScore >= args.scoreThreshold;
    const forceApplyForConfiguredRegion =
      shouldBypassWorkplacePolicy(normalized, args.scoringProfile) && policy.allowed;
    const finalDecision: "APPLY" | "SKIP" =
      forceApplyForConfiguredRegion || (policy.allowed && meetsThreshold) ? "APPLY" : "SKIP";
    const reason = forceApplyForConfiguredRegion
      ? "Configured workplace-policy bypass matched this job location, so the role will be applied."
      : !policy.allowed
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

    const persisted = await persistJobAnalysisRecord({
      prisma: deps.prisma as never,
      logger: deps.logger,
      url,
      extracted,
      parsed: parseResult.parsed,
      normalized,
      score: score.totalScore,
      finalDecision,
      policyAllowed: policy.allowed,
      reasons: !policy.allowed ? policy.reasons : [reason],
      parseVersion: PARSE_VERSION,
    });

    await persistJobHistory(
      {
        jobPostingId: persisted.jobPosting.id,
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
          aiAdjustment: score.aiAdjustment ?? 0,
          aiReasoning: score.aiReasoning ?? null,
          aiConfidence: score.aiConfidence ?? null,
          scoringSource: score.scoringSource ?? "deterministic",
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
