import { performance } from "node:perf_hooks";
import type { CliArgs } from "../cli.js";
import { LINKEDIN_BROWSER_SESSION_OPTIONS } from "../constants.js";
import type { AppDeps } from "../deps.js";
import { createBatchJobEvaluator } from "../flowHelpers.js";
import { persistRunArtifact, persistSystemEvent } from "../observability.js";
import { getErrorMessage, serializeError } from "../../utils/errors.js";
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

function buildCollectionJobUrl(collectionUrl: string, jobUrl: string): string {
  try {
    const collection = new URL(collectionUrl);
    const job = new URL(jobUrl);
    const jobId = job.pathname.match(/\/jobs\/view\/(\d+)/)?.[1];
    if (!jobId) {
      return collection.toString();
    }

    collection.searchParams.set("currentJobId", jobId);
    return collection.toString();
  } catch {
    return collectionUrl;
  }
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
        useAiScoreAdjustment: args.useAiScoreAdjustment,
      },
    },
    deps,
  );

  const result = await deps.withPage(
    LINKEDIN_BROWSER_SESSION_OPTIONS,
    async (page) => {
      const driver = await deps.createEasyApplyDriver(page);
      const evaluationPage = args.disableAiEvaluation
        ? undefined
        : await page.context().newPage();
      const evaluateJob = createBatchJobEvaluator({
        disableAiEvaluation: args.disableAiEvaluation,
        scoreThreshold: args.scoreThreshold,
        useAiScoreAdjustment: args.useAiScoreAdjustment,
        source: "explore-batch",
        systemScope: "explore.batch",
        recommendationPolicy: "all-evaluated",
        scoringProfile,
        ...(evaluationPage ? { evaluationPage } : {}),
        deps,
      });

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

          for (const job of visibleJobs) {
            if (seenUrls.has(job.url)) {
              continue;
            }

            seenUrls.add(job.url);

            if (job.alreadyApplied) {
              continue;
            }

            let evaluation: EasyApplyJobEvaluation;
            try {
              evaluation = await evaluateJob(job.url);
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

            await driver.openCollection(buildCollectionJobUrl(args.url, job.url));
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
      useAiScoreAdjustment: args.useAiScoreAdjustment,
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
