import type { Page } from "@playwright/test";
import type { CliArgs } from "../cli.js";
import type { AppDeps } from "../deps.js";
import { persistRunArtifact } from "../observability.js";
import { getLatestJobReviewsByUrl } from "../../utils/jobHistory.js";
import {
  isReactJobsDetailUrl,
  isReactJobsListingUrl,
} from "../../reactjobs/listing.js";
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
  const jobs = await deps.withPage(async (page) => {
    const listings = (await deps.extractReactJobsListings(page, args.url)).slice(
      0,
      args.count,
    );
    const preloadedReviews = await getLatestJobReviewsByUrl({
      prisma: deps.prisma,
      jobUrls: listings.map((listing) => listing.url),
      source: "apply-batch",
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

    return jobs;
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
      pagesVisited: 1,
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

export async function runApplyDryRunFlow(
  args: ApplyArgs | ApplyBatchArgs,
  deps: AppDeps,
) {
  if (args.mode === "apply-batch") {
    return isReactJobsListingUrl(args.url)
      ? runReactJobsApplyBatchFlow(args, deps)
      : runLinkedInApplyDryRunFlow(args, deps);
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
  return isReactJobsListingUrl(args.url)
    ? runReactJobsApplyBatchFlow(args, deps)
    : runLinkedInApplyBatchFlow(args, deps);
}
