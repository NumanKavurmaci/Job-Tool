import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppDeps } from "../../../src/app/deps.js";

function createDeps(): AppDeps {
  return {
    getConfiguredProviderInfo: vi.fn(),
    loadCandidateMasterProfile: vi.fn(),
    resolveAnswer: vi.fn(),
    withPage: vi.fn(),
    extractJobText: vi.fn(),
    formatJobForLLM: vi.fn(),
    parseJob: vi.fn(),
    normalizeParsedJob: vi.fn(),
    loadCandidateProfile: vi.fn(),
    scoreJob: vi.fn(),
    evaluatePolicy: vi.fn(),
    decideJob: vi.fn(),
    runEasyApplyDryRun: vi.fn(),
    runEasyApply: vi.fn(),
    runEasyApplyBatch: vi.fn(),
    runEasyApplyBatchDryRun: vi.fn(),
    createEasyApplyDriver: vi.fn(),
    writeRunReport: vi.fn(),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any,
    prisma: {
      systemLog: { create: vi.fn().mockResolvedValue({}) },
      jobReviewHistory: {
        create: vi.fn().mockResolvedValue({}),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    } as any,
    exit: vi.fn(),
  } as AppDeps;
}

function mockWithPage(deps: AppDeps) {
  const evaluationPage = { close: vi.fn().mockResolvedValue(undefined) };
  const page = {
    context: () => ({
      newPage: vi.fn().mockResolvedValue(evaluationPage),
    }),
  };
  (deps.withPage as any).mockImplementation(
    async (_options: unknown, fn: (page: unknown) => Promise<unknown>) => fn(page),
  );
  return { evaluationPage };
}

describe("easy apply flows", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("runs a single dry run, persists history, and writes an easy-apply artifact", async () => {
    const deps = createDeps();
    const { evaluationPage } = mockWithPage(deps);
    (deps.loadCandidateMasterProfile as any).mockResolvedValue({
      fullName: "Jane",
      sourceMetadata: { resumePath: "./resume.pdf" },
    });
    (deps.loadCandidateProfile as any).mockResolvedValue({});
    (deps.resolveAnswer as any).mockResolvedValue({ answer: "ok" });
    (deps.createEasyApplyDriver as any).mockResolvedValue({ driver: true });
    (deps.runEasyApplyDryRun as any).mockResolvedValue({
      status: "ready_to_submit",
      steps: [{ action: "review" }],
      stopReason: "Reached the final submit step.",
      url: "https://www.linkedin.com/jobs/view/1",
    });
    (deps.writeRunReport as any).mockResolvedValue("artifacts/easy-apply-runs/run.json");

    const { runEasyApplyDryRunFlow } = await import("../../../src/app/flows/easyApplyFlows.js");
    const result = await runEasyApplyDryRunFlow(
      {
        mode: "easy-apply-dry-run",
        url: "https://www.linkedin.com/jobs/view/1",
        resumePath: "./resume.pdf",
        count: 1,
        disableAiEvaluation: false,
        scoreThreshold: 60,
      },
      deps,
    );

    expect(result.reportPath).toBe("artifacts/easy-apply-runs/run.json");
    expect(deps.prisma.jobReviewHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobUrl: "https://www.linkedin.com/jobs/view/1",
        source: "easy-apply-dry-run",
        status: "READY_TO_SUBMIT",
        summary: "Reached the final submit step.",
      }),
    });
    expect(deps.prisma.systemLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        level: "INFO",
        scope: "linkedin.easy_apply",
        message: "LinkedIn Easy Apply dry run finished.",
        runType: "easy-apply-dry-run",
        jobUrl: "https://www.linkedin.com/jobs/view/1",
      }),
    });
    expect(evaluationPage.close).toHaveBeenCalledTimes(1);
  });

  it("includes review diagnostics in dry-run logging for single-job flows", async () => {
    const deps = createDeps();
    const { evaluationPage } = mockWithPage(deps);
    (deps.loadCandidateMasterProfile as any).mockResolvedValue({
      fullName: "Jane",
      sourceMetadata: { resumePath: "./resume.pdf" },
    });
    (deps.loadCandidateProfile as any).mockResolvedValue({});
    (deps.resolveAnswer as any).mockResolvedValue({ answer: "ok" });
    (deps.createEasyApplyDriver as any).mockResolvedValue({ driver: true });
    (deps.runEasyApplyDryRun as any).mockResolvedValue({
      status: "stopped_manual_review_required",
      steps: [{ action: "review" }],
      stopReason: "Needs manual review.",
      url: "https://www.linkedin.com/jobs/view/1",
      reviewDiagnostics: {
        validationMessages: ["Missing answer"],
        blockingFields: ["Field A"],
        buttonStates: [],
      },
    });
    (deps.writeRunReport as any).mockResolvedValue("artifacts/easy-apply-runs/run.json");

    const { runEasyApplyDryRunFlow } = await import("../../../src/app/flows/easyApplyFlows.js");
    await runEasyApplyDryRunFlow(
      {
        mode: "easy-apply-dry-run",
        url: "https://www.linkedin.com/jobs/view/1",
        resumePath: "./resume.pdf",
        count: 1,
        disableAiEvaluation: false,
        scoreThreshold: 60,
      },
      deps,
    );

    expect(deps.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewDiagnostics: {
          validationMessages: ["Missing answer"],
          blockingFields: ["Field A"],
          buttonStates: [],
        },
      }),
      "LinkedIn Easy Apply dry run finished",
    );
    expect(evaluationPage.close).toHaveBeenCalledTimes(1);
  });

  it("runs a batch dry run, persists batch history, and writes a batch artifact", async () => {
    const deps = createDeps();
    const { evaluationPage } = mockWithPage(deps);
    (deps.loadCandidateMasterProfile as any).mockResolvedValue({
      fullName: "Jane",
      sourceMetadata: { resumePath: "./resume.pdf" },
    });
    (deps.loadCandidateProfile as any).mockResolvedValue({});
    (deps.resolveAnswer as any).mockResolvedValue({ answer: "ok" });
    (deps.createEasyApplyDriver as any).mockResolvedValue({ driver: true });
    (deps.runEasyApplyBatchDryRun as any).mockResolvedValue({
      status: "completed",
      collectionUrl: "https://www.linkedin.com/jobs/collections/easy-apply",
      requestedCount: 2,
      attemptedCount: 1,
      evaluatedCount: 2,
      skippedCount: 1,
      pagesVisited: 1,
      stopReason: "Processed 1 job.",
      jobs: [
        {
          url: "https://www.linkedin.com/jobs/view/1",
          evaluation: {
            shouldApply: true,
            finalDecision: "APPLY",
            score: 72,
            reason: "Good fit",
            policyAllowed: true,
          },
          result: {
            status: "ready_to_submit",
            steps: [{ action: "review" }],
            stopReason: "Reached final submit.",
            url: "https://www.linkedin.com/jobs/view/1",
          },
        },
      ],
    });
    (deps.writeRunReport as any).mockResolvedValue("artifacts/batch-runs/run.json");

    const { runEasyApplyDryRunFlow } = await import("../../../src/app/flows/easyApplyFlows.js");
    const result = await runEasyApplyDryRunFlow(
      {
        mode: "easy-apply-dry-run",
        url: "https://www.linkedin.com/jobs/collections/easy-apply",
        resumePath: "./resume.pdf",
        count: 2,
        disableAiEvaluation: false,
        scoreThreshold: 60,
      },
      deps,
    );

    expect(result.reportPath).toBe("artifacts/batch-runs/run.json");
    expect(deps.runEasyApplyBatchDryRun).toHaveBeenCalledTimes(1);
    expect(deps.prisma.jobReviewHistory.create).toHaveBeenCalledTimes(2);
    expect(deps.prisma.systemLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        level: "INFO",
        scope: "linkedin.easy_apply",
        message: "LinkedIn Easy Apply dry run finished.",
        runType: "easy-apply-dry-run",
      }),
    });
    expect(evaluationPage.close).toHaveBeenCalledTimes(1);
  });

  it("handles dry-run failures by wrapping them in a LinkedIn app error", async () => {
    const deps = createDeps();
    mockWithPage(deps);
    (deps.loadCandidateMasterProfile as any).mockResolvedValue({
      fullName: "Jane",
      sourceMetadata: { resumePath: "./resume.pdf" },
    });
    (deps.loadCandidateProfile as any).mockResolvedValue({});
    (deps.createEasyApplyDriver as any).mockResolvedValue({ driver: true });
    (deps.runEasyApplyDryRun as any).mockRejectedValue(new Error("boom"));

    const { runEasyApplyDryRunFlow } = await import("../../../src/app/flows/easyApplyFlows.js");

    await expect(
      runEasyApplyDryRunFlow(
        {
          mode: "easy-apply-dry-run",
          url: "https://www.linkedin.com/jobs/view/1",
          resumePath: "./resume.pdf",
          count: 1,
          disableAiEvaluation: false,
          scoreThreshold: 60,
        },
        deps,
      ),
    ).rejects.toMatchObject({
      phase: "linkedin_easy_apply",
      code: "LINKEDIN_EASY_APPLY_FAILED",
    });
    expect(deps.logger.error).toHaveBeenCalled();
  });

  it("runs the live easy-apply flow and preserves the external apply URL branch", async () => {
    const deps = createDeps();
    mockWithPage(deps);
    (deps.loadCandidateMasterProfile as any).mockResolvedValue({
      fullName: "Jane",
      sourceMetadata: { resumePath: "./resume.pdf" },
    });
    (deps.resolveAnswer as any).mockResolvedValue({ answer: "ok" });
    (deps.createEasyApplyDriver as any).mockResolvedValue({ driver: true });
    (deps.runEasyApply as any).mockResolvedValue({
      status: "stopped_external_apply",
      steps: [{ action: "external" }],
      stopReason: "Use company website.",
      url: "https://www.linkedin.com/jobs/view/1",
      externalApplyUrl: "https://company.example/apply",
    });
    (deps.writeRunReport as any).mockResolvedValue("artifacts/easy-apply-runs/live.json");

    const { runEasyApplyFlow } = await import("../../../src/app/flows/easyApplyFlows.js");
    const result = await runEasyApplyFlow(
      {
        mode: "easy-apply",
        url: "https://www.linkedin.com/jobs/view/1",
        resumePath: "./resume.pdf",
      },
      deps,
    );

    expect(result.reportPath).toBe("artifacts/easy-apply-runs/live.json");
    expect(deps.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        externalApplyUrl: "https://company.example/apply",
      }),
      "LinkedIn Easy Apply finished",
    );
    expect(deps.prisma.systemLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        level: "INFO",
        scope: "linkedin.easy_apply",
        message: "LinkedIn Easy Apply finished.",
        runType: "easy-apply",
      }),
    });
  });

  it("includes review diagnostics in single-job easy-apply logging", async () => {
    const deps = createDeps();
    mockWithPage(deps);
    (deps.loadCandidateMasterProfile as any).mockResolvedValue({
      fullName: "Jane",
      sourceMetadata: { resumePath: "./resume.pdf" },
    });
    (deps.resolveAnswer as any).mockResolvedValue({ answer: "ok" });
    (deps.createEasyApplyDriver as any).mockResolvedValue({ driver: true });
    (deps.runEasyApply as any).mockResolvedValue({
      status: "stopped_manual_review_required",
      steps: [{ action: "review" }],
      stopReason: "Needs manual review.",
      url: "https://www.linkedin.com/jobs/view/1",
      reviewDiagnostics: {
        validationMessages: ["Missing answer"],
        blockingFields: ["Field A"],
        buttonStates: [],
      },
    });
    (deps.writeRunReport as any).mockResolvedValue("artifacts/easy-apply-runs/live.json");

    const { runEasyApplyFlow } = await import("../../../src/app/flows/easyApplyFlows.js");
    await runEasyApplyFlow(
      {
        mode: "easy-apply",
        url: "https://www.linkedin.com/jobs/view/1",
        resumePath: "./resume.pdf",
      },
      deps,
    );

    expect(deps.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewDiagnostics: {
          validationMessages: ["Missing answer"],
          blockingFields: ["Field A"],
          buttonStates: [],
        },
      }),
      "LinkedIn Easy Apply finished",
    );
  });

  it("runs the batch live flow and persists batch history", async () => {
    const deps = createDeps();
    const { evaluationPage } = mockWithPage(deps);
    (deps.loadCandidateMasterProfile as any).mockResolvedValue({
      fullName: "Jane",
      sourceMetadata: { resumePath: "./resume.pdf" },
    });
    (deps.loadCandidateProfile as any).mockResolvedValue({});
    (deps.resolveAnswer as any).mockResolvedValue({ answer: "ok" });
    (deps.createEasyApplyDriver as any).mockResolvedValue({ driver: true });
    (deps.runEasyApplyBatch as any).mockResolvedValue({
      status: "completed",
      collectionUrl: "https://www.linkedin.com/jobs/collections/easy-apply",
      requestedCount: 1,
      attemptedCount: 1,
      evaluatedCount: 1,
      skippedCount: 0,
      pagesVisited: 1,
      stopReason: "Processed 1 job.",
      jobs: [
        {
          url: "https://www.linkedin.com/jobs/view/1",
          evaluation: {
            shouldApply: true,
            finalDecision: "APPLY",
            score: 72,
            reason: "Good fit",
            policyAllowed: true,
          },
          result: {
            status: "submitted",
            steps: [{ action: "submit" }],
            stopReason: "Submitted.",
            url: "https://www.linkedin.com/jobs/view/1",
          },
        },
      ],
    });
    (deps.writeRunReport as any).mockResolvedValue("artifacts/batch-runs/live.json");

    const { runEasyApplyBatchFlow } = await import("../../../src/app/flows/easyApplyFlows.js");
    const result = await runEasyApplyBatchFlow(
      {
        mode: "easy-apply-batch",
        url: "https://www.linkedin.com/jobs/collections/easy-apply",
        resumePath: "./resume.pdf",
        count: 1,
        disableAiEvaluation: false,
        scoreThreshold: 60,
      },
      deps,
    );

    expect(result.reportPath).toBe("artifacts/batch-runs/live.json");
    expect(deps.prisma.jobReviewHistory.create).toHaveBeenCalledTimes(2);
    expect(deps.prisma.systemLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        level: "INFO",
        scope: "linkedin.batch",
        message: "LinkedIn Easy Apply batch finished.",
        runType: "easy-apply-batch",
      }),
    });
    expect(evaluationPage.close).toHaveBeenCalledTimes(1);
  });

  it("runs the batch live flow without creating an evaluation page when AI evaluation is disabled", async () => {
    const deps = createDeps();
    const newPageMock = vi.fn();
    const page = {
      context: () => ({
        newPage: newPageMock,
      }),
    };
    (deps.withPage as any).mockImplementation(
      async (_options: unknown, fn: (page: unknown) => Promise<unknown>) => fn(page),
    );
    (deps.loadCandidateMasterProfile as any).mockResolvedValue({
      fullName: "Jane",
      sourceMetadata: { resumePath: "./resume.pdf" },
    });
    (deps.loadCandidateProfile as any).mockResolvedValue({});
    (deps.resolveAnswer as any).mockResolvedValue({ answer: "ok" });
    (deps.createEasyApplyDriver as any).mockResolvedValue({ driver: true });
    (deps.runEasyApplyBatch as any).mockResolvedValue({
      status: "completed",
      collectionUrl: "https://www.linkedin.com/jobs/collections/easy-apply",
      requestedCount: 1,
      attemptedCount: 0,
      evaluatedCount: 1,
      skippedCount: 0,
      pagesVisited: 1,
      stopReason: "Processed 0 job.",
      jobs: [],
    });
    (deps.writeRunReport as any).mockResolvedValue("artifacts/batch-runs/live.json");

    const { runEasyApplyBatchFlow } = await import("../../../src/app/flows/easyApplyFlows.js");
    await runEasyApplyBatchFlow(
      {
        mode: "easy-apply-batch",
        url: "https://www.linkedin.com/jobs/collections/easy-apply",
        resumePath: "./resume.pdf",
        count: 1,
        disableAiEvaluation: true,
        scoreThreshold: 60,
      },
      deps,
    );

    expect(newPageMock).not.toHaveBeenCalled();
  });

  it("wraps batch live flow failures with a LinkedIn app error", async () => {
    const deps = createDeps();
    mockWithPage(deps);
    (deps.loadCandidateMasterProfile as any).mockResolvedValue({
      fullName: "Jane",
      sourceMetadata: { resumePath: "./resume.pdf" },
    });
    (deps.loadCandidateProfile as any).mockResolvedValue({});
    (deps.createEasyApplyDriver as any).mockResolvedValue({ driver: true });
    (deps.runEasyApplyBatch as any).mockRejectedValue(new Error("submit failed"));

    const { runEasyApplyBatchFlow } = await import("../../../src/app/flows/easyApplyFlows.js");

    await expect(
      runEasyApplyBatchFlow(
        {
          mode: "easy-apply-batch",
          url: "https://www.linkedin.com/jobs/collections/easy-apply",
          resumePath: "./resume.pdf",
          count: 1,
          disableAiEvaluation: false,
          scoreThreshold: 60,
        },
        deps,
      ),
    ).rejects.toMatchObject({
      phase: "linkedin_easy_apply",
      code: "LINKEDIN_EASY_APPLY_FAILED",
    });
  });
});
