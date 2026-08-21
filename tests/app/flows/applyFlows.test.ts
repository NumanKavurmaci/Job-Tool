import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppDeps } from "../../../src/app/deps.js";
import { KariyerPageStateError } from "../../../src/kariyer/pageState.js";

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
  const navigationContext = {
    minIntervalMs: 0,
    maxRetryAfterMs: 10_000,
    now: vi.fn(() => 0),
    beforeNavigation: vi.fn(async () => undefined),
    waitForRateLimit: vi.fn(async () => undefined),
  };
  return {
    withPage: vi.fn(async (
      optionsOrCallback: object | ((page: unknown) => Promise<unknown>),
      maybeCallback?: (page: unknown) => Promise<unknown>,
    ) => (maybeCallback ?? optionsOrCallback as (page: unknown) => Promise<unknown>)({})),
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
    extractKariyerListings: vi.fn(async () => []),
    extractKariyerListingsBatch: vi.fn(async () => ({
      listings: [
        {
          jobId: "4536815",
          url: "https://www.kariyer.net/is-ilani/arox-bilisim-sistemleri-a-s-yazilim-gelistirme-uzmani-c-c-4536815",
          title: "Yazılım Geliştirme Uzmanı (C/C++)",
          company: "Arox Bilişim Sistemleri A.Ş.",
          location: "İstanbul(Asya) (Ataşehir)",
          workplaceType: "İş Yerinde",
          badges: ["Tam Zamanlı"],
          posted: "Bugün",
        },
      ],
      pagesVisited: 1,
    })),
    createKariyerNavigationContext: vi.fn(() => navigationContext),
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

  it("expands Kariyer.net listings with the Kariyer session and dry-runs each approved job", async () => {
    const deps = createDeps();
    const listingUrl =
      "https://www.kariyer.net/is-ilanlari/yazilim+gelistirme+uzmani?pst=3193&pkw=yaz%C4%B1l%C4%B1m%20geli%C5%9Ftirme%20uzman%C4%B1";
    const jobUrl =
      "https://www.kariyer.net/is-ilani/arox-bilisim-sistemleri-a-s-yazilim-gelistirme-uzmani-c-c-4536815";

    const result = await runApplyDryRunFlow(
      {
        mode: "apply-batch",
        url: listingUrl,
        resumePath: "./user/resume.pdf",
        count: 1,
        disableAiEvaluation: false,
        scoreThreshold: 40,
        scoringMode: "local",
        dryRun: true,
      },
      deps,
    );

    expect(deps.extractKariyerListingsBatch).toHaveBeenCalledWith(
      {},
      listingUrl,
      1,
      expect.objectContaining({ minIntervalMs: 0 }),
    );
    expect(deps.createBatchJobEvaluator).toHaveBeenCalledWith(
      expect.objectContaining({
        systemScope: "kariyer.batch",
        evaluationPage: {},
        jobExtractionOptions: {
          kariyerNavigationContext: expect.objectContaining({ minIntervalMs: 0 }),
        },
      }),
    );
    expect(externalMocks.dryRun).toHaveBeenCalledWith(
      expect.objectContaining({ url: jobUrl, dryRun: true }),
      deps,
      expect.objectContaining({
        originalJobUrl: jobUrl,
        sessionOptions: expect.objectContaining({ persistStorageState: true }),
        existingPage: {},
        kariyerNavigationContext: expect.objectContaining({ minIntervalMs: 0 }),
      }),
    );
    expect(result.applyBatch).toMatchObject({
      collectionUrl: listingUrl,
      evaluatedCount: 1,
      attemptedCount: 1,
      failedCount: 0,
      pagesVisited: 1,
    });
    expect(deps.withPage).toHaveBeenCalledTimes(1);
  });

  it("reuses one Kariyer page while evaluating multiple listings", async () => {
    const deps = createDeps();
    const listingUrl = "https://www.kariyer.net/is-ilanlari/yazilim";
    (deps.extractKariyerListingsBatch as any).mockResolvedValue({
      listings: [
        {
          jobId: "4536815",
          url: "https://www.kariyer.net/is-ilani/acme-backend-developer-4536815",
          title: "Backend Developer",
          company: "Acme",
          location: "İstanbul",
          workplaceType: "Hibrit",
          badges: [],
          posted: "Bugün",
        },
        {
          jobId: "4536816",
          url: "https://www.kariyer.net/is-ilani/acme-frontend-developer-4536816",
          title: "Frontend Developer",
          company: "Acme",
          location: "İstanbul",
          workplaceType: "Hibrit",
          badges: [],
          posted: "Bugün",
        },
      ],
      pagesVisited: 1,
    });
    const evaluateJob = vi.fn(async () => ({
      shouldApply: false,
      finalDecision: "SKIP" as const,
      score: 10,
      reason: "Below threshold.",
      policyAllowed: true,
    }));
    (deps.createBatchJobEvaluator as any).mockReturnValue(evaluateJob);

    const result = await runApplyBatchFlow(
      {
        mode: "apply-batch",
        url: listingUrl,
        resumePath: "./user/resume.pdf",
        count: 2,
        disableAiEvaluation: false,
        scoreThreshold: 40,
        scoringMode: "local",
        dryRun: true,
      },
      deps,
    );

    expect(deps.withPage).toHaveBeenCalledTimes(1);
    expect(evaluateJob).toHaveBeenCalledTimes(2);
    expect(externalMocks.dryRun).not.toHaveBeenCalled();
    expect(result.applyBatch).toMatchObject({
      evaluatedCount: 2,
      skippedCount: 2,
      failedCount: 0,
    });
  });

  it("stops the Kariyer batch immediately on a typed security challenge", async () => {
    const deps = createDeps();
    let sessionCleanedUp = false;
    (deps.withPage as any).mockImplementation(async (
      _options: object,
      callback: (page: unknown) => Promise<unknown>,
    ) => {
      try {
        return await callback({});
      } finally {
        sessionCleanedUp = true;
      }
    });
    const listingUrl = "https://www.kariyer.net/is-ilanlari/yazilim";
    const listings = [
      {
        jobId: "4536815",
        url: "https://www.kariyer.net/is-ilani/acme-backend-developer-4536815",
        title: "Backend Developer",
        company: "Acme",
        location: "İstanbul",
        workplaceType: "Hibrit",
        badges: [],
        posted: "Bugün",
      },
      {
        jobId: "4536816",
        url: "https://www.kariyer.net/is-ilani/acme-frontend-developer-4536816",
        title: "Frontend Developer",
        company: "Acme",
        location: "İstanbul",
        workplaceType: "Hibrit",
        badges: [],
        posted: "Bugün",
      },
    ];
    (deps.extractKariyerListingsBatch as any).mockResolvedValue({
      listings,
      pagesVisited: 1,
    });
    const evaluateJob = vi.fn(async () => {
      throw new KariyerPageStateError(
        {
          state: "manual_verification",
          url: listings[0]!.url,
          marker: "http_403",
          statusCode: 403,
          retryAfterMs: null,
        },
        "Kariyer.net job detail",
      );
    });
    (deps.createBatchJobEvaluator as any).mockReturnValue(evaluateJob);

    const result = await runApplyBatchFlow(
      {
        mode: "apply-batch",
        url: listingUrl,
        resumePath: "./user/resume.pdf",
        count: 2,
        disableAiEvaluation: false,
        scoreThreshold: 40,
        scoringMode: "local",
        dryRun: true,
      },
      deps,
    );

    expect(evaluateJob).toHaveBeenCalledTimes(1);
    expect(externalMocks.dryRun).not.toHaveBeenCalled();
    expect(sessionCleanedUp).toBe(true);
    expect(result.applyBatch).toMatchObject({
      evaluatedCount: 1,
      failedCount: 1,
      stoppedEarly: true,
      terminalPageState: {
        code: "KARIYER_MANUAL_VERIFICATION_REQUIRED",
        pageState: "manual_verification",
      },
    });
    expect(result.applyBatch.stopReason).toContain(
      "No remaining Kariyer.net listings were processed.",
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
