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
    });
    expect(deps.prisma.jobReviewHistory.findMany).toHaveBeenCalledWith({
      where: {
        jobUrl: { in: [detailUrl] },
        source: "apply-batch",
      },
      orderBy: [{ jobUrl: "asc" }, { createdAt: "desc" }],
    });
    expect(deps.createBatchJobEvaluator).toHaveBeenCalledWith(
      expect.objectContaining({
        preloadedReviews: expect.any(Map),
      }),
    );
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
    (deps.extractReactJobsListings as any).mockResolvedValue([]);

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
