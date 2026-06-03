import type { Page } from "@playwright/test";
import type { CliArgs } from "../cli.js";
import type { AppDeps } from "../deps.js";
import { persistJobHistory, persistRunArtifact } from "../observability.js";
import { getLatestJobReviewsByUrl } from "../../utils/jobHistory.js";
import {
  isReactJobsDetailUrl,
  isReactJobsListingUrl,
} from "../../reactjobs/listing.js";
import { isAshbyListingUrl } from "../../ashby/listing.js";
import {
  runExternalApplyDryRunFlow,
  runExternalApplyFlow,
} from "./externalApplyFlows.js";
import {
  runLinkedInApplyBatchFlow,
  runLinkedInApplyDryRunFlow,
  runLinkedInApplyFlow,
} from "./linkedinApplyShared.js";

type ApplyArgs = Extract<CliArgs, { mode: "apply" }>;
type ApplyBatchArgs = Extract<CliArgs, { mode: "apply-batch" }>;

function isLinkedInUrl(url: string) {
  return /linkedin\.com\//i.test(url);
}

function mapExternalApplicationToHistoryStatus(args: {
  dryRun: boolean;
  finalStage?: string | null;
}): "READY_TO_SUBMIT" | "SUBMITTED" | "FAILED" {
  if (args.finalStage === "completed") {
    return args.dryRun ? "READY_TO_SUBMIT" : "SUBMITTED";
  }

  if (args.finalStage === "final_submit_step") {
    return "READY_TO_SUBMIT";
  }

  return "FAILED";
}

async function resolveExternalApplyUrl(
  page: Page,
  url: string,
  deps: AppDeps,
) {
  const extracted = await deps.extractJobText(page, url);
  if (!extracted.applyUrl || extracted.applyUrl === url) {
    throw new Error(`No external Apply link was found on ReactJobs detail page: ${url}`);
  }

  return extracted.applyUrl;
}

async function runExternalApplyFromSource(
  args: ApplyArgs,
  deps: AppDeps,
) {
  const applyUrl = isReactJobsDetailUrl(args.url)
    ? await deps.withPage((page) => resolveExternalApplyUrl(page, args.url, deps))
    : args.url;
  const externalArgs = {
    mode: "external-apply" as const,
    url: applyUrl,
    resumePath: args.resumePath,
    dryRun: Boolean(args.dryRun),
  };
  const result = args.dryRun
    ? await runExternalApplyDryRunFlow(externalArgs, deps, {
        originalJobUrl: args.url,
      })
    : await runExternalApplyFlow(externalArgs, deps, {
        originalJobUrl: args.url,
      });

  return {
    ...result,
    mode: "apply" as const,
    sourceJobUrl: args.url,
  };
}

async function runReactJobsApplyBatchFlow(
  args: ApplyBatchArgs,
  deps: AppDeps,
) {
  const scoringProfile = await deps.loadCandidateProfile();
  const { jobs, pagesVisited } = await deps.withPage(async (page) => {
    const listingBatch = await deps.extractReactJobsListingsBatch(page, args.url, args.count);
    const listings = listingBatch.listings.slice(0, args.count);
    const preloadedReviews = await getLatestJobReviewsByUrl({
      prisma: deps.prisma,
      jobUrls: listings.map((listing) => listing.url),
      logger: deps.logger,
    });
    const evaluateJob = deps.createBatchJobEvaluator({
      disableAiEvaluation: args.disableAiEvaluation,
      scoreThreshold: args.scoreThreshold,
      scoringMode: args.scoringMode,
      source: "apply-batch",
      systemScope: "reactjobs.batch",
      recommendationPolicy: "apply-only",
      scoringProfile,
      evaluationPage: page,
      preloadedReviews,
      deps,
    });

    const jobs = [];
    for (const listing of listings) {
      try {
        const evaluation = await evaluateJob(listing.url);
        if (!evaluation.shouldApply) {
          jobs.push({ ...listing, status: "skipped" as const, evaluation });
          continue;
        }

        const applyUrl = await resolveExternalApplyUrl(page, listing.url, deps);
        const externalArgs = {
          mode: "external-apply" as const,
          url: applyUrl,
          resumePath: args.resumePath,
          dryRun: Boolean(args.dryRun),
        };
        const application = args.dryRun
          ? await runExternalApplyDryRunFlow(externalArgs, deps, {
              originalJobUrl: listing.url,
            })
          : await runExternalApplyFlow(externalArgs, deps, {
              originalJobUrl: listing.url,
            });
        await persistJobHistory(
          {
            jobUrl: listing.url,
            source: "apply-batch",
            status: mapExternalApplicationToHistoryStatus({
              dryRun: Boolean(args.dryRun),
              finalStage: application.finalStage,
            }),
            score: evaluation.score,
            threshold: args.scoreThreshold,
            decision: evaluation.finalDecision,
            policyAllowed: evaluation.policyAllowed,
            reasons: [application.stopReason],
            summary: application.stopReason,
            details: {
              shouldApply: evaluation.shouldApply,
              finalDecision: evaluation.finalDecision,
              applyUrl,
              externalFinalStage: application.finalStage,
            },
          },
          deps,
        );

        jobs.push({
          ...listing,
          status: "processed" as const,
          evaluation,
          applyUrl,
          application,
        });
      } catch (error) {
        jobs.push({
          ...listing,
          status: "failed" as const,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      jobs,
      pagesVisited: listingBatch.pagesVisited,
    };
  });
  const attemptedCount = jobs.filter((job) => job.status === "processed").length;
  const skippedCount = jobs.filter((job) => job.status === "skipped").length;
  const failedCount = jobs.filter((job) => job.status === "failed").length;
  const result = {
    mode: "apply-batch" as const,
    dryRun: Boolean(args.dryRun),
    applyBatch: {
      status: failedCount > 0 ? ("partial" as const) : ("completed" as const),
      collectionUrl: args.url,
      requestedCount: args.count,
      evaluatedCount: jobs.length,
      attemptedCount,
      skippedCount,
      failedCount,
      pagesVisited,
      stopReason:
        jobs.length === 0
          ? "No ReactJobs listings were discovered."
          : `Processed ${attemptedCount} ReactJobs application(s), skipped ${skippedCount}, and failed ${failedCount}.`,
      jobs,
    },
  };
  const reportPath = await persistRunArtifact({
    category: "batch-runs",
    prefix: args.dryRun ? "apply-batch-dry-run" : "apply-batch",
    payload: result,
    deps,
  });

  return { ...result, reportPath };
}

async function runAshbyApplyBatchFlow(
  args: ApplyBatchArgs,
  deps: AppDeps,
) {
  const scoringProfile = await deps.loadCandidateProfile();
  const { jobs, pagesVisited } = await deps.withPage(async (page) => {
    const listingBatch = await deps.extractAshbyListingsBatch(page, args.url, args.count);
    const listings = listingBatch.listings.slice(0, args.count);
    const preloadedReviews = await getLatestJobReviewsByUrl({
      prisma: deps.prisma,
      jobUrls: listings.map((listing) => listing.url),
      logger: deps.logger,
    });
    const evaluateJob = deps.createBatchJobEvaluator({
      disableAiEvaluation: args.disableAiEvaluation,
      scoreThreshold: args.scoreThreshold,
      scoringMode: args.scoringMode,
      source: "apply-batch",
      systemScope: "ashby.batch",
      recommendationPolicy: "apply-only",
      scoringProfile,
      evaluationPage: page,
      preloadedReviews,
      deps,
    });

    const jobs = [];
    for (const listing of listings) {
      try {
        const evaluation = await evaluateJob(listing.url);
        if (!evaluation.shouldApply) {
          jobs.push({ ...listing, status: "skipped" as const, evaluation });
          continue;
        }

        const externalArgs = {
          mode: "external-apply" as const,
          url: listing.url,
          resumePath: args.resumePath,
          dryRun: Boolean(args.dryRun),
        };
        const application = args.dryRun
          ? await runExternalApplyDryRunFlow(externalArgs, deps, {
              originalJobUrl: listing.url,
            })
          : await runExternalApplyFlow(externalArgs, deps, {
              originalJobUrl: listing.url,
            });
        await persistJobHistory(
          {
            jobUrl: listing.url,
            source: "apply-batch",
            status: mapExternalApplicationToHistoryStatus({
              dryRun: Boolean(args.dryRun),
              finalStage: application.finalStage,
            }),
            score: evaluation.score,
            threshold: args.scoreThreshold,
            decision: evaluation.finalDecision,
            policyAllowed: evaluation.policyAllowed,
            reasons: [application.stopReason],
            summary: application.stopReason,
            details: {
              shouldApply: evaluation.shouldApply,
              finalDecision: evaluation.finalDecision,
              applyUrl: listing.url,
              externalFinalStage: application.finalStage,
            },
          },
          deps,
        );

        jobs.push({
          ...listing,
          status: "processed" as const,
          evaluation,
          applyUrl: listing.url,
          application,
        });
      } catch (error) {
        jobs.push({
          ...listing,
          status: "failed" as const,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      jobs,
      pagesVisited: listingBatch.pagesVisited,
    };
  });
  const attemptedCount = jobs.filter((job) => job.status === "processed").length;
  const skippedCount = jobs.filter((job) => job.status === "skipped").length;
  const failedCount = jobs.filter((job) => job.status === "failed").length;
  const result = {
    mode: "apply-batch" as const,
    dryRun: Boolean(args.dryRun),
    applyBatch: {
      status: failedCount > 0 ? ("partial" as const) : ("completed" as const),
      collectionUrl: args.url,
      requestedCount: args.count,
      evaluatedCount: jobs.length,
      attemptedCount,
      skippedCount,
      failedCount,
      pagesVisited,
      stopReason:
        jobs.length === 0
          ? "No Ashby listings were discovered."
          : `Processed ${attemptedCount} Ashby application(s), skipped ${skippedCount}, and failed ${failedCount}.`,
      jobs,
    },
  };
  const reportPath = await persistRunArtifact({
    category: "batch-runs",
    prefix: args.dryRun ? "apply-batch-dry-run" : "apply-batch",
    payload: result,
    deps,
  });

  return { ...result, reportPath };
}

export async function runApplyDryRunFlow(
  args: ApplyArgs | ApplyBatchArgs,
  deps: AppDeps,
) {
  if (args.mode === "apply-batch") {
    if (isReactJobsListingUrl(args.url)) {
      return runReactJobsApplyBatchFlow(args, deps);
    }
    if (isAshbyListingUrl(args.url)) {
      return runAshbyApplyBatchFlow(args, deps);
    }
    return runLinkedInApplyDryRunFlow(args, deps);
  }

  return isLinkedInUrl(args.url)
    ? runLinkedInApplyDryRunFlow(args, deps)
    : runExternalApplyFromSource(args, deps);
}

export async function runApplyFlow(args: ApplyArgs, deps: AppDeps) {
  return isLinkedInUrl(args.url)
    ? runLinkedInApplyFlow(args, deps)
    : runExternalApplyFromSource(args, deps);
}

export async function runApplyBatchFlow(args: ApplyBatchArgs, deps: AppDeps) {
  if (isReactJobsListingUrl(args.url)) {
    return runReactJobsApplyBatchFlow(args, deps);
  }
  if (isAshbyListingUrl(args.url)) {
    return runAshbyApplyBatchFlow(args, deps);
  }
  return runLinkedInApplyBatchFlow(args, deps);
}
