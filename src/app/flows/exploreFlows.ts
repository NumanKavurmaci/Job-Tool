import { performance } from "node:perf_hooks";
import type { Page } from "@playwright/test";
import type { CliArgs } from "../cli.js";
import { LINKEDIN_BROWSER_SESSION_OPTIONS, PARSE_VERSION } from "../constants.js";
import type { AppDeps } from "../deps.js";
import {
  createBatchJobEvaluator,
  createScoringProfileFingerprint,
} from "../flowHelpers.js";
import { persistRunArtifact, persistSystemEvent } from "../observability.js";
import { getErrorMessage, serializeError } from "../../utils/errors.js";
import {
  getLatestJobReviewsByUrl,
  type JobReviewHistory,
} from "../../utils/jobHistory.js";
import type {
  EasyApplyCollectionJob,
  EasyApplyDriver,
  EasyApplyJobEvaluation,
} from "../../linkedin/easyApply.js";

type ExploreBatchArgs = Extract<CliArgs, { mode: "explore-batch" }>;

export type ExploreBatchJobResult = {
  url: string;
  evaluation: EasyApplyJobEvaluation;
};

export type ExploreBatchRunResult = {
  status: "completed" | "partial" | "stopped_no_jobs";
  collectionUrl: string;
  requestedCount: number;
  evaluatedCount: number;
  recommendedCount: number;
  skippedCount: number;
  failedCount: number;
  pagesVisited: number;
  jobs: ExploreBatchJobResult[];
  stopReason: string;
};

function buildEvaluationFailureResult(error: unknown): EasyApplyJobEvaluation {
  const serialized = serializeError(error);
  const summary = getErrorMessage(error);

  return {
    shouldApply: false,
    finalDecision: "SKIP",
    score: 0,
    reason: `Job evaluation failed: ${summary}`,
    policyAllowed: false,
    error: serialized,
  };
}

function readReviewDetails(review: Pick<JobReviewHistory, "detailsJson">): Record<string, unknown> {
  if (!review.detailsJson) {
    return {};
  }

  try {
    const parsed = JSON.parse(review.detailsJson);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function buildReusableExploreEvaluation(args: {
  review?: JobReviewHistory;
  scoreThreshold: number;
  scoringMode: "local" | "ai";
  scoringProfileFingerprint: string;
}): EasyApplyJobEvaluation | null {
  const review = args.review;
  if (!review) {
    return null;
  }

  if (
    review.source !== "explore-batch" ||
    (review.status !== "EVALUATED" && review.status !== "SKIPPED") ||
    !review.decision ||
    typeof review.score !== "number" ||
    typeof review.policyAllowed !== "boolean" ||
    review.threshold !== args.scoreThreshold
  ) {
    return null;
  }

  const details = readReviewDetails(review);
  const expectedScoringSource = args.scoringMode === "ai" ? "llm" : "deterministic";
  if (
    details.parseVersion !== PARSE_VERSION ||
    details.scoringSource !== expectedScoringSource ||
    details.scoringProfileFingerprint !== args.scoringProfileFingerprint
  ) {
    return null;
  }

  return {
    shouldApply: review.decision === "APPLY",
    finalDecision: review.decision,
    score: review.score,
    reason: review.summary ?? buildReusableExploreReason(review),
    policyAllowed: review.policyAllowed,
    diagnostics: {
      metadataRead: false,
      companyInfoRead: false,
    },
  };
}

function buildReusableExploreReason(
  review: Pick<JobReviewHistory, "createdAt" | "decision" | "score">,
): string {
  return `Reused explore-batch evaluation from ${review.createdAt.toISOString().slice(0, 10)} with decision ${review.decision} and score ${review.score}.`;
}

async function collectVisibleBatchJobs(
  driver: EasyApplyDriver,
): Promise<EasyApplyCollectionJob[]> {
  if (driver.collectVisibleJobs) {
    return driver.collectVisibleJobs();
  }

  return ((await driver.collectVisibleJobUrls?.()) ?? []).map((url) => ({
    url,
    alreadyApplied: false,
  }));
}

export async function runExploreBatchFlow(
  args: ExploreBatchArgs,
  deps: AppDeps,
) {
  const startedAt = performance.now();
  const scoringProfile = await deps.loadCandidateProfile();
  const scoringProfileFingerprint = createScoringProfileFingerprint(scoringProfile);

  await persistSystemEvent(
    {
      level: "INFO",
      scope: "explore.batch",
      message: "Starting explore batch flow.",
      runType: "explore-batch",
      jobUrl: args.url,
      details: {
        count: args.count,
        scoreThreshold: args.scoreThreshold,
        disableAiEvaluation: args.disableAiEvaluation,
        scoringMode: args.scoringMode,
      },
    },
    deps,
  );

  const result = await deps.withPage(
    LINKEDIN_BROWSER_SESSION_OPTIONS,
    async (page) => {
      const driver = await deps.createEasyApplyDriver(page);
      let evaluationPage: Page | undefined;
      const preloadedReviews = new Map<string, JobReviewHistory>();
      const sameRunEvaluations = new Map<string, EasyApplyJobEvaluation>();
      let evaluateJob:
        | ((url: string) => Promise<EasyApplyJobEvaluation>)
        | undefined;

      const getEvaluateJob = async () => {
        if (!evaluateJob) {
          evaluationPage = args.disableAiEvaluation
            ? undefined
            : await page.context().newPage();
          evaluateJob = createBatchJobEvaluator({
            disableAiEvaluation: args.disableAiEvaluation,
            scoreThreshold: args.scoreThreshold,
            scoringMode: args.scoringMode,
            source: "explore-batch",
            systemScope: "explore.batch",
            recommendationPolicy: "all-evaluated",
            preloadedReviews,
            scoringProfile,
            ...(evaluationPage ? { evaluationPage } : {}),
            deps,
          });
        }

        return evaluateJob;
      };

      try {
        const requestedCount = Math.max(1, Math.floor(args.count));
        const seenUrls = new Set<string>();
        const jobs: ExploreBatchJobResult[] = [];
        let pagesVisited = 0;
        let recommendedCount = 0;
        let failedCount = 0;

        await driver.ensureAuthenticated(args.url);
        await driver.openCollection(args.url);
        pagesVisited += 1;

        while (jobs.length < requestedCount) {
          const visibleJobs = await collectVisibleBatchJobs(driver);
          const remainingCount = requestedCount - jobs.length;
          const candidates: EasyApplyCollectionJob[] = [];

          for (const job of visibleJobs) {
            if (seenUrls.has(job.url)) {
              continue;
            }

            seenUrls.add(job.url);

            if (job.alreadyApplied) {
              continue;
            }

            candidates.push(job);
            if (candidates.length >= remainingCount) {
              break;
            }
          }

          preloadedReviews.clear();
          if (!args.disableAiEvaluation && candidates.length > 0) {
            const latestReviews = await getLatestJobReviewsByUrl({
              prisma: deps.prisma,
              jobUrls: candidates.map((job) => job.url),
              source: "explore-batch",
              logger: deps.logger,
            });
            for (const [url, review] of latestReviews) {
              preloadedReviews.set(url, review);
            }
          }

          for (const job of candidates) {
            let evaluation: EasyApplyJobEvaluation;

            const sameRunEvaluation = sameRunEvaluations.get(job.url);
            const reusableEvaluation =
              sameRunEvaluation ??
              (!args.disableAiEvaluation
                ? buildReusableExploreEvaluation({
                    review: preloadedReviews.get(job.url) as JobReviewHistory,
                    scoreThreshold: args.scoreThreshold,
                    scoringMode: args.scoringMode,
                    scoringProfileFingerprint,
                  })
                : null);

            if (reusableEvaluation) {
              evaluation = reusableEvaluation;
            } else {
              try {
                evaluation = await (await getEvaluateJob())(job.url);
                sameRunEvaluations.set(job.url, evaluation);
              } catch (error) {
                failedCount += 1;
                evaluation = buildEvaluationFailureResult(error);
                deps.logger.warn(
                  {
                    url: job.url,
                    error: serializeError(error),
                  },
                  "Explore batch evaluation failed for job",
                );
                await persistSystemEvent(
                  {
                    level: "ERROR",
                    scope: "explore.batch",
                    message: "Explore batch evaluation failed for job.",
                    runType: "explore-batch",
                    jobUrl: job.url,
                    details: {
                      error: serializeError(error),
                    },
                  },
                  deps,
                );
              }
            }
            jobs.push({
              url: job.url,
              evaluation,
            });

            if (evaluation.shouldApply) {
              recommendedCount += 1;
            }

            if (jobs.length >= requestedCount) {
              break;
            }
          }

          if (jobs.length >= requestedCount) {
            break;
          }

          const advanced = await driver.goToNextResultsPage();
          if (!advanced) {
            break;
          }

          pagesVisited += 1;
        }

        if (jobs.length === 0) {
          return {
            status: "stopped_no_jobs" as const,
            collectionUrl: args.url,
            requestedCount,
            evaluatedCount: 0,
            recommendedCount: 0,
            skippedCount: 0,
            failedCount: 0,
            pagesVisited,
            jobs,
            stopReason:
              "No LinkedIn jobs were evaluated from the selected collection.",
          };
        }

        return {
          status:
            jobs.length >= requestedCount ? ("completed" as const) : ("partial" as const),
          collectionUrl: args.url,
          requestedCount,
          evaluatedCount: jobs.length,
          recommendedCount,
          skippedCount: jobs.length - recommendedCount,
          failedCount,
          pagesVisited,
          jobs,
          stopReason:
            jobs.length >= requestedCount
              ? `Evaluated ${jobs.length} LinkedIn job(s) for recommendations.`
              : `Only evaluated ${jobs.length} LinkedIn job(s) before pagination ended.`,
        };
      } finally {
        await evaluationPage?.close().catch(() => undefined);
      }
    },
  );

  await persistSystemEvent(
    {
      level: "INFO",
      scope: "explore.batch",
      message: "Explore batch flow finished.",
      runType: "explore-batch",
      jobUrl: args.url,
      details: {
        status: result.status,
        evaluatedCount: result.evaluatedCount,
        recommendedCount: result.recommendedCount,
        skippedCount: result.skippedCount,
        failedCount: result.failedCount,
        pagesVisited: result.pagesVisited,
      },
    },
    deps,
  );

  deps.logger.info(
    {
      status: result.status,
      requestedCount: result.requestedCount,
      evaluatedCount: result.evaluatedCount,
      recommendedCount: result.recommendedCount,
      skippedCount: result.skippedCount,
      failedCount: result.failedCount,
      pagesVisited: result.pagesVisited,
      stopReason: result.stopReason,
    },
    "Explore batch finished",
  );

  const reportPath = await persistRunArtifact({
    category: "batch-runs",
    prefix: "explore-batch",
    payload: {
      mode: args.mode,
      url: args.url,
      count: args.count,
      scoreThreshold: args.scoreThreshold,
      disableAiEvaluation: args.disableAiEvaluation,
      scoringMode: args.scoringMode,
      result,
      meta: {
        durationMs: Math.round(performance.now() - startedAt),
        finishedAt: new Date().toISOString(),
        summary: `Explore batch evaluated ${result.evaluatedCount} job(s) and recommended ${result.recommendedCount}.`,
      },
    },
    deps,
  });

  return {
    mode: args.mode,
    explore: result,
    reportPath,
  };
}
