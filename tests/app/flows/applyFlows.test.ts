import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppDeps } from "../../../src/app/deps.js";

const externalMocks = vi.hoisted(() => ({
  dryRun: vi.fn(),
  live: vi.fn(),
}));

vi.mock("../../../src/app/flows/externalApplyFlows.js", () => ({
  runExternalApplyDryRunFlow: externalMocks.dryRun,
  runExternalApplyFlow: externalMocks.live,
}));

import {
  runApplyBatchFlow,
  runApplyDryRunFlow,
  runApplyFlow,
} from "../../../src/app/flows/applyFlows.js";

const detailUrl =
  "https://reactjobs.io/react-jobs/robusta/8446-senior-frontend-engineer-react-nextjs-octopus-by-rtg";
const applyUrl =
  "https://apply.workable.com/robusta/j/6AA24D2C5C/apply/?ref=reactjobs.io";

function createDeps(): AppDeps {
  return {
    withPage: vi.fn(async (callback: (page: unknown) => Promise<unknown>) =>
      callback({}),
    ),
    extractJobText: vi.fn(async () => ({ applyUrl })),
    extractReactJobsListings: vi.fn(async () => [
      {
        url: detailUrl,
        title: "Senior Frontend Engineer",
        company: "Robusta",
        location: "Remote",
        employmentType: "Full-time",
        posted: "1d",
      },
    ]),
    extractReactJobsListingsBatch: vi.fn(async () => ({
      listings: [
        {
          url: detailUrl,
          title: "Senior Frontend Engineer",
          company: "Robusta",
          location: "Remote",
          employmentType: "Full-time",
          posted: "1d",
        },
      ],
      pagesVisited: 1,
    })),
    extractAshbyListings: vi.fn(async () => [
      {
        url: "https://jobs.ashbyhq.com/ruby-labs/19d7a5d4-4938-4b4e-80d6-42d475c72393",
        title: "AI Engineer",
        company: "Ruby Labs",
        location: "Turkey",
        employmentType: "Full time",
        workplaceType: "Remote",
        department: "Engineering",
      },
    ]),
    extractAshbyListingsBatch: vi.fn(async () => ({
      listings: [
        {
          url: "https://jobs.ashbyhq.com/ruby-labs/19d7a5d4-4938-4b4e-80d6-42d475c72393",
          title: "AI Engineer",
          company: "Ruby Labs",
          location: "Turkey",
          employmentType: "Full time",
          workplaceType: "Remote",
          department: "Engineering",
        },
      ],
      pagesVisited: 1,
    })),
    createBatchJobEvaluator: vi.fn(() => async () => ({
      shouldApply: true,
      finalDecision: "APPLY",
      score: 0,
      reason: "AI evaluation disabled for this batch run.",
      policyAllowed: true,
    })),
    loadCandidateProfile: vi.fn(async () => ({})),
    prisma: {
      jobReviewHistory: {
        findMany: vi.fn(async () => []),
        create: vi.fn(async () => ({})),
      },
    },
    logger: {
      warn: vi.fn(),
    },
    writeRunReport: vi.fn(async () => "artifacts/batch-runs/apply-batch.json"),
  } as unknown as AppDeps;
}

describe("apply flows", () => {
  beforeEach(() => {
    externalMocks.dryRun.mockReset().mockResolvedValue({ finalStage: "form_step" });
    externalMocks.live.mockReset().mockResolvedValue({ finalStage: "completed" });
  });

  it("resolves a ReactJobs detail page to its external application", async () => {
    const deps = createDeps();

    const result = await runApplyDryRunFlow(
      {
        mode: "apply",
        url: detailUrl,
        resumePath: "./user/resume.pdf",
        dryRun: true,
      },
      deps,
    );

    expect(externalMocks.dryRun).toHaveBeenCalledWith(
      {
        mode: "external-apply",
        url: applyUrl,
        resumePath: "./user/resume.pdf",
        dryRun: true,
      },
      deps,
      { originalJobUrl: detailUrl },
    );
    expect(result).toMatchObject({ mode: "apply", sourceJobUrl: detailUrl });
  });

  it("expands ReactJobs result pages and processes their external applications", async () => {
    const deps = createDeps();

    const result = await runApplyBatchFlow(
      {
        mode: "apply-batch",
        url: "https://reactjobs.io/jobs/nextjs/remote?search=Nextjs&isRemote=true",
        resumePath: "./user/resume.pdf",
        count: 5,
        disableAiEvaluation: true,
        scoreThreshold: 40,
        scoringMode: "local",
        dryRun: true,
      },
      deps,
    );

    expect(externalMocks.dryRun).toHaveBeenCalledWith(
      expect.objectContaining({ url: applyUrl, dryRun: true }),
      deps,
      { originalJobUrl: detailUrl },
    );
    expect(result.applyBatch).toMatchObject({
      requestedCount: 5,
      evaluatedCount: 1,
      attemptedCount: 1,
      failedCount: 0,
      pagesVisited: 1,
    });
    expect(deps.prisma.jobReviewHistory.findMany).toHaveBeenCalledWith({
      where: {
        jobUrl: { in: [detailUrl] },
      },
      orderBy: [{ jobUrl: "asc" }, { createdAt: "desc" }],
    });
    expect(deps.createBatchJobEvaluator).toHaveBeenCalledWith(
      expect.objectContaining({
        preloadedReviews: expect.any(Map),
      }),
    );
  });

  it("expands Ashby listing pages and processes direct Ashby applications", async () => {
    const deps = createDeps();
    const ashbyUrl = "https://jobs.ashbyhq.com/ruby-labs/19d7a5d4-4938-4b4e-80d6-42d475c72393";

    const result = await runApplyBatchFlow(
      {
        mode: "apply-batch",
        url: "https://jobs.ashbyhq.com/ruby-labs?workplaceType=Remote",
        resumePath: "./user/resume.pdf",
        count: 1,
        disableAiEvaluation: true,
        scoreThreshold: 40,
        scoringMode: "local",
        dryRun: true,
      },
      deps,
    );

    expect(deps.extractAshbyListingsBatch).toHaveBeenCalledWith(
      {},
      "https://jobs.ashbyhq.com/ruby-labs?workplaceType=Remote",
      1,
    );
    expect(externalMocks.dryRun).toHaveBeenCalledWith(
      expect.objectContaining({ url: ashbyUrl, dryRun: true }),
      deps,
      { originalJobUrl: ashbyUrl },
    );
    expect(result.applyBatch.stopReason).toBe(
      "Processed 1 Ashby application(s), skipped 0, and failed 0.",
    );
  });

  it("paginates ReactJobs result pages until enough listings are collected", async () => {
    const deps = createDeps();
    (deps.extractReactJobsListingsBatch as any).mockResolvedValue({
      listings: [
        {
          url: "https://reactjobs.io/react-jobs/company/1-role",
          title: "Role 1",
          company: "One",
          location: "Remote",
          employmentType: "Full-time",
          posted: "1d",
        },
        {
          url: "https://reactjobs.io/react-jobs/company/2-role",
          title: "Role 2",
          company: "Two",
          location: "Remote",
          employmentType: "Full-time",
          posted: "2d",
        },
      ],
      pagesVisited: 2,
    });

    const result = await runApplyBatchFlow(
      {
        mode: "apply-batch",
        url: "https://reactjobs.io/jobs/nextjs/remote?search=Nextjs&isRemote=true",
        resumePath: "./user/resume.pdf",
        count: 2,
        disableAiEvaluation: true,
        scoreThreshold: 40,
        scoringMode: "local",
        dryRun: true,
      },
      deps,
    );

    expect(deps.extractReactJobsListingsBatch).toHaveBeenCalledWith(
      expect.anything(),
      "https://reactjobs.io/jobs/nextjs/remote?search=Nextjs&isRemote=true",
      2,
    );
    expect(result.applyBatch).toMatchObject({
      requestedCount: 2,
      evaluatedCount: 2,
      attemptedCount: 2,
      pagesVisited: 2,
    });
  });

  it("uses the external application driver directly for non-LinkedIn pages", async () => {
    const deps = createDeps();
    const url = "https://apply.example.com/job/1";

    await runApplyFlow(
      {
        mode: "apply",
        url,
        resumePath: "./user/resume.pdf",
      },
      deps,
    );

    expect(deps.withPage).not.toHaveBeenCalled();
    expect(externalMocks.live).toHaveBeenCalledWith(
      expect.objectContaining({ url, dryRun: false }),
      deps,
      { originalJobUrl: url },
    );
  });

  it("records failed ReactJobs handoffs without aborting the batch", async () => {
    const deps = createDeps();
    (deps.extractJobText as any).mockResolvedValue({ applyUrl: detailUrl });

    const result = await runApplyBatchFlow(
      {
        mode: "apply-batch",
        url: "https://reactjobs.io/jobs/nextjs/remote",
        resumePath: "./user/resume.pdf",
        count: 1,
        disableAiEvaluation: true,
        scoreThreshold: 40,
        scoringMode: "local",
      },
      deps,
    );

    expect(result.applyBatch).toMatchObject({
      status: "partial",
      attemptedCount: 0,
      failedCount: 1,
    });
  });

  it("runs ReactJobs batches through the live external driver", async () => {
    const deps = createDeps();

    await runApplyBatchFlow(
      {
        mode: "apply-batch",
        url: "https://reactjobs.io/jobs/nextjs/remote",
        resumePath: "./user/resume.pdf",
        count: 1,
        disableAiEvaluation: true,
        scoreThreshold: 40,
        scoringMode: "local",
      },
      deps,
    );

    expect(externalMocks.live).toHaveBeenCalledWith(
      expect.objectContaining({ url: applyUrl, dryRun: false }),
      deps,
      { originalJobUrl: detailUrl },
    );
  });

  it("skips ReactJobs listings that do not pass evaluation", async () => {
    const deps = createDeps();
    (deps.createBatchJobEvaluator as any).mockReturnValue(async () => ({
      shouldApply: false,
      finalDecision: "SKIP",
      score: 10,
      reason: "Below threshold.",
      policyAllowed: true,
    }));

    const result = await runApplyBatchFlow(
      {
        mode: "apply-batch",
        url: "https://reactjobs.io/jobs/nextjs/remote",
        resumePath: "./user/resume.pdf",
        count: 1,
        disableAiEvaluation: false,
        scoreThreshold: 40,
        scoringMode: "local",
      },
      deps,
    );

    expect(result.applyBatch).toMatchObject({
      attemptedCount: 0,
      skippedCount: 1,
      failedCount: 0,
    });
    expect(externalMocks.live).not.toHaveBeenCalled();
  });

  it("persists ReactJobs submission history on the original listing URL", async () => {
    const deps = createDeps();
    externalMocks.live.mockResolvedValue({
      finalStage: "completed",
      stopReason: "Submitted the application successfully.",
    });

    await runApplyBatchFlow(
      {
        mode: "apply-batch",
        url: "https://reactjobs.io/jobs/nextjs/remote",
        resumePath: "./user/resume.pdf",
        count: 1,
        disableAiEvaluation: true,
        scoreThreshold: 40,
        scoringMode: "local",
      },
      deps,
    );

    expect(deps.prisma.jobReviewHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobUrl: detailUrl,
        source: "apply-batch",
        status: "SUBMITTED",
        decision: "APPLY",
        score: 0,
        threshold: 40,
        policyAllowed: true,
        summary: "Submitted the application successfully.",
      }),
    });
  });

  it("skips ReactJobs listings that were already submitted in a previous run even when AI evaluation is disabled", async () => {
    const deps = createDeps();
    (deps.prisma.jobReviewHistory.findMany as any).mockResolvedValue([
      {
        jobUrl: detailUrl,
        createdAt: new Date("2026-06-01T10:00:00.000Z"),
        status: "SUBMITTED",
        decision: "APPLY",
        score: 55,
        policyAllowed: true,
      },
    ]);
    (deps.createBatchJobEvaluator as any).mockImplementation(
      ({ preloadedReviews }: { preloadedReviews: Map<string, { score: number; policyAllowed: boolean }> }) =>
        async (url: string) =>
          preloadedReviews.has(url)
            ? {
                shouldApply: false,
                finalDecision: "SKIP",
                score: preloadedReviews.get(url)?.score ?? 0,
                reason: "Already reviewed.",
                policyAllowed: preloadedReviews.get(url)?.policyAllowed ?? true,
              }
            : {
                shouldApply: true,
                finalDecision: "APPLY",
                score: 0,
                reason: "AI evaluation disabled for this batch run.",
                policyAllowed: true,
              },
    );

    const result = await runApplyBatchFlow(
      {
        mode: "apply-batch",
        url: "https://reactjobs.io/jobs/nextjs/remote",
        resumePath: "./user/resume.pdf",
        count: 1,
        disableAiEvaluation: true,
        scoreThreshold: 40,
        scoringMode: "local",
      },
      deps,
    );

    expect(result.applyBatch).toMatchObject({
      attemptedCount: 0,
      skippedCount: 1,
      failedCount: 0,
    });
    expect(externalMocks.live).not.toHaveBeenCalled();
    expect(externalMocks.dryRun).not.toHaveBeenCalled();
  });

  it("rejects ReactJobs detail pages without an external Apply link", async () => {
    const deps = createDeps();
    (deps.extractJobText as any).mockResolvedValue({ applyUrl: null });

    await expect(
      runApplyDryRunFlow(
        {
          mode: "apply",
          url: detailUrl,
          resumePath: "./user/resume.pdf",
          dryRun: true,
        },
        deps,
      ),
    ).rejects.toThrow("No external Apply link was found on ReactJobs detail page");
  });

  it("reports empty ReactJobs result pages", async () => {
    const deps = createDeps();
    (deps.extractReactJobsListingsBatch as any).mockResolvedValue({
      listings: [],
      pagesVisited: 1,
    });

    const result = await runApplyBatchFlow(
      {
        mode: "apply-batch",
        url: "https://reactjobs.io/jobs/nextjs/remote",
        resumePath: "./user/resume.pdf",
        count: 1,
        disableAiEvaluation: true,
        scoreThreshold: 40,
        scoringMode: "local",
      },
      deps,
    );

    expect(result.applyBatch.stopReason).toBe("No ReactJobs listings were discovered.");
  });
});
