import type { Page } from "@playwright/test";
import { createHash } from "node:crypto";
import type { JobExtractionOptions } from "../adapters/types.js";
import type { CandidateProfile } from "../candidate/types.js";
import type { InputQuestion } from "../questions/types.js";
import type { ScoringMode } from "./cli.js";
import {
  buildDuplicateReviewReason,
  getLatestPersistedJobDecisionReview,
  getLatestJobReview,
  type JobReviewHistory,
  shouldRetryPendingApprovedReview,
  shouldSkipDuplicateBatchReview,
} from "../utils/jobHistory.js";
import {
  jobPostingNeedsMetadataRefresh,
  persistJobAnalysisRecord,
  persistJobRecommendationRecord,
  refreshJobPostingMetadata,
} from "../utils/jobPersistence.js";
import { canonicalizeJobPostingUrl } from "../utils/jobIdentity.js";
import { PARSE_VERSION, resolveJobEvaluationSessionOptions } from "./constants.js";
import type { AppDeps } from "./deps.js";
import {
  ALREADY_APPLIED_SCORE_SKIP_REASON,
  analyzeExtractedJob,
  buildJobDiagnostics,
  resolveDecisionOutcome,
} from "./jobEvaluation.js";
import { persistJobHistory, persistSystemEvent } from "./observability.js";
import type { TimingRecorder } from "../utils/timing.js";

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

export function createScoringProfileFingerprint(profile: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(profile) ?? "undefined")
    .digest("hex");
}

export function createBatchJobEvaluator(args: {
  disableAiEvaluation: boolean;
  scoreThreshold: number;
  scoringMode: ScoringMode;
  allowExternalLinkedInApply?: boolean;
  source?: string;
  systemScope?: string;
  recommendationPolicy?: "never" | "apply-only" | "all-evaluated";
  preloadedReviews?: Map<string, JobReviewHistory | null>;
  timings?: TimingRecorder;
  scoringProfile: Awaited<ReturnType<AppDeps["loadCandidateProfile"]>>;
  evaluationPage?: Page;
  jobExtractionOptions?: JobExtractionOptions;
  deps: AppDeps;
}) {
  const deps = args.deps;
  const reviewSource = args.source ?? "easy-apply-batch";
  const systemScope = args.systemScope ?? "linkedin.batch";
  const recommendationPolicy = args.recommendationPolicy ?? "never";
  const scoringProfileFingerprint = createScoringProfileFingerprint(args.scoringProfile);
  const time = <T>(name: string, fn: () => Promise<T>) =>
    args.timings ? args.timings.time(name, fn) : fn();
  const extractJobTextForEvaluation = (page: Page, url: string) =>
    args.jobExtractionOptions
      ? deps.extractJobText(page, url, args.jobExtractionOptions)
      : deps.extractJobText(page, url);
  const shouldPersistRecommendation = (finalDecision: "APPLY" | "SKIP" | "MAYBE") => {
    switch (recommendationPolicy) {
      case "all-evaluated":
        return true;
      case "apply-only":
        return finalDecision === "APPLY";
      default:
        return false;
    }
  };

  const evaluateOnPage = async (evaluationPage: Page, url: string) => {
    let latestReview: JobReviewHistory | null;
    try {
      latestReview = args.preloadedReviews?.has(url)
        ? args.preloadedReviews.get(url) ?? null
        : await getLatestJobReview({
            prisma: deps.prisma,
            jobUrl: url,
            logger: deps.logger,
            throwOnError: true,
          });
      if (!latestReview) {
        latestReview = await getLatestPersistedJobDecisionReview({
          prisma: deps.prisma,
          jobUrl: url,
          logger: deps.logger,
          throwOnError: true,
        });
      }
    } catch (error) {
      const reason =
        "Job review history could not be verified, so AI evaluation was blocked.";
      deps.logger.warn({ url, error }, reason);
      await persistSystemEvent(
        {
          level: "ERROR",
          scope: systemScope,
          message: reason,
          runType: reviewSource,
          jobUrl: url,
        },
        deps,
      );
      return {
        shouldApply: false,
        finalDecision: "SKIP" as const,
        score: 0,
        reason,
        policyAllowed: false,
      };
    }
    if (
      latestReview &&
      shouldSkipDuplicateBatchReview(latestReview)
    ) {
      const existingJobPosting = deps.prisma.jobPosting.findUnique
        ? await deps.prisma.jobPosting.findUnique({
            where: { url: canonicalizeJobPostingUrl(url) },
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
        const extracted = await extractJobTextForEvaluation(evaluationPage, url);
        await refreshJobPostingMetadata({
          prisma: deps.prisma,
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
          scope: systemScope,
          message: "Skipping duplicate job review.",
          runType: reviewSource,
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

    if (
      latestReview &&
      shouldRetryPendingApprovedReview(latestReview)
    ) {
      const reason =
        "Job was previously approved, so its stored decision will be reused without another AI review.";

      deps.logger.info(
        {
          url,
          previousStatus: latestReview.status,
          previousDecision: latestReview.decision,
          previousScore: latestReview.score,
        },
        "Reusing previously approved job review",
      );
      await persistSystemEvent(
        {
          level: "INFO",
          scope: systemScope,
          message: "Reused a previously approved job review without AI evaluation.",
          runType: reviewSource,
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
        shouldApply: true,
        finalDecision: "APPLY" as const,
        score: latestReview.score ?? 0,
        reason,
        policyAllowed: latestReview.policyAllowed ?? true,
      };
    }

    if (latestReview) {
      const reason = buildDuplicateReviewReason(latestReview);
      deps.logger.warn(
        { url, reason },
        "Skipping AI evaluation for previously reviewed job",
      );
      await persistSystemEvent(
        {
          level: "WARN",
          scope: systemScope,
          message: "Skipped AI evaluation for a previously reviewed job.",
          runType: reviewSource,
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

    const extracted = await time("job.extractText", () =>
      extractJobTextForEvaluation(evaluationPage, url),
    );
    const diagnostics = buildJobDiagnostics(extracted);
    await persistSystemEvent(
      {
        level: "INFO",
        scope: systemScope,
        message: "Batch job context extracted.",
        runType: reviewSource,
        jobUrl: url,
        details: diagnostics,
      },
      deps,
    );
    if (extracted.alreadyApplied === true) {
      deps.logger.info(
        { url, platform: extracted.platform },
        "Skipping score evaluation for already-applied job",
      );
      await persistSystemEvent(
        {
          level: "INFO",
          scope: systemScope,
          message: "Skipped parsing and score evaluation for an already-applied job.",
          runType: reviewSource,
          jobUrl: url,
          details: {
            alreadyApplied: true,
            platform: extracted.platform,
            diagnostics,
          },
        },
        deps,
      );

      return {
        shouldApply: false,
        finalDecision: "SKIP" as const,
        score: 0,
        reason: ALREADY_APPLIED_SCORE_SKIP_REASON,
        policyAllowed: true,
        alreadyApplied: true,
        diagnostics,
      };
    }
    if (args.disableAiEvaluation) {
      return {
        shouldApply: true,
        finalDecision: "APPLY" as const,
        score: 0,
        reason: "AI evaluation disabled for this batch run.",
        policyAllowed: true,
        diagnostics,
      };
    }
    const analysis = await time("job.analyze", () => analyzeExtractedJob({
      extracted,
      scoringProfile: args.scoringProfile,
      deps,
      scoringMode: args.scoringMode,
      ...(args.allowExternalLinkedInApply != null
        ? { allowExternalLinkedInApply: args.allowExternalLinkedInApply }
        : {}),
    }));
    const normalized = analysis.normalized;
    const score = analysis.score;
    const policy = analysis.policy;
    const outcome = resolveDecisionOutcome({
      normalized,
      scoringProfile: args.scoringProfile,
      policy,
      score,
      scoreThreshold: args.scoreThreshold,
    });
    const finalDecision = outcome.finalDecision;
    const reason = outcome.reason;

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
    await persistSystemEvent(
      {
        level: "INFO",
        scope: systemScope,
        message: "Batch job evaluation completed.",
        runType: reviewSource,
        jobUrl: url,
        details: {
          finalDecision,
          shouldApply: finalDecision === "APPLY",
          score: score.totalScore,
          scoreThreshold: args.scoreThreshold,
          policyAllowed: policy.allowed,
          decisionReason: reason,
          policyReasons: policy.reasons,
          workplacePolicyBypassed: outcome.workplacePolicyBypassed,
          diagnostics,
        },
      },
      deps,
    );

    const persisted = await time("job.persistAnalysis", () => persistJobAnalysisRecord({
      prisma: deps.prisma,
      logger: deps.logger,
      url,
      extracted,
      parsed: analysis.parsed,
      normalized,
      score: score.totalScore,
      finalDecision,
      policyAllowed: policy.allowed,
      reasons: outcome.finalReasons,
      parseVersion: PARSE_VERSION,
    }));

    if (shouldPersistRecommendation(finalDecision)) {
      await time("job.persistRecommendation", () => persistJobRecommendationRecord({
        prisma: deps.prisma,
        logger: deps.logger,
        jobPostingId: persisted.jobPosting.id,
        source: reviewSource,
        score: score.totalScore,
        decision: finalDecision,
        policyAllowed: policy.allowed,
        summary: reason,
        reasons: outcome.finalReasons,
        details: {
          scoreThreshold: args.scoreThreshold,
          shouldApply: finalDecision === "APPLY",
          parseVersion: PARSE_VERSION,
          aiAdjustment: score.aiAdjustment ?? 0,
          aiReasoning: score.aiReasoning ?? null,
          aiConfidence: score.aiConfidence ?? null,
          scoringSource: score.scoringSource ?? "deterministic",
          scoringProfileFingerprint,
          workplacePolicyBypassed: outcome.workplacePolicyBypassed,
          diagnostics,
        },
      }));
    }

    await time("job.persistHistory", () => persistJobHistory(
      {
        jobPostingId: persisted.jobPosting.id,
        jobUrl: url,
        source: reviewSource,
        status: finalDecision === "APPLY" ? "EVALUATED" : "SKIPPED",
        score: score.totalScore,
        threshold: args.scoreThreshold,
        decision: finalDecision,
        policyAllowed: policy.allowed,
        reasons: outcome.finalReasons,
        summary: reason,
        ...(normalized.platform ? { platform: normalized.platform } : {}),
        details: {
          shouldApply: finalDecision === "APPLY",
          parseVersion: PARSE_VERSION,
          aiAdjustment: score.aiAdjustment ?? 0,
          aiReasoning: score.aiReasoning ?? null,
          aiConfidence: score.aiConfidence ?? null,
          scoringSource: score.scoringSource ?? "deterministic",
          scoringProfileFingerprint,
          workplacePolicyBypassed: outcome.workplacePolicyBypassed,
        },
      },
      deps,
    ));

    return {
      shouldApply: finalDecision === "APPLY",
      finalDecision,
      score: score.totalScore,
      reason,
      policyAllowed: policy.allowed,
      diagnostics,
    };
  };

  if (args.evaluationPage) {
    return async (url: string) => evaluateOnPage(args.evaluationPage as Page, url);
  }

  return async (url: string) =>
    deps.withPage(
      resolveJobEvaluationSessionOptions(url),
      async (evaluationPage) => evaluateOnPage(evaluationPage, url),
    );
}
