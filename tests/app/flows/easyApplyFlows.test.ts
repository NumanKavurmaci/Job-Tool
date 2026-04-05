import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppDeps } from "../../../src/app/deps.js";

const runExternalApplyDryRunFlowMock = vi.fn();
const runExternalApplyFlowMock = vi.fn();

vi.mock("../../../src/app/flows/externalApplyFlows.js", () => ({
  runExternalApplyDryRunFlow: runExternalApplyDryRunFlowMock,
  runExternalApplyFlow: runExternalApplyFlowMock,
}));

function createDeps(): AppDeps {
  const scoreJob = vi.fn();
  const scoreJobWithAi = vi.fn().mockImplementation(async (...args) => scoreJob(...args));

  return {
    getConfiguredProviderInfo: vi.fn(),
    loadCandidateMasterProfile: vi.fn(),
    resolveAnswer: vi.fn(),
    withPage: vi.fn(),
    extractJobText: vi.fn(),
    formatJobForLLM: vi.fn(),
    parseJob: vi.fn(),
    completePrompt: vi.fn(),
    normalizeParsedJob: vi.fn(),
    loadCandidateProfile: vi.fn(),
    scoreJob,
    scoreJobWithAi,
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
      candidateProfileSnapshot: {
        create: vi.fn().mockResolvedValue({ id: "snapshot_1" }),
      },
      preparedAnswerSet: {
        create: vi.fn().mockResolvedValue({ id: "prepared_1" }),
      },
      systemLog: { create: vi.fn().mockResolvedValue({}) },
      jobReviewHistory: {
        create: vi.fn().mockResolvedValue({}),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      jobPosting: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi
          .fn()
          .mockResolvedValue({ id: "job_1", company: "Acme", title: "Engineer" }),
      },
      applicationDecision: {
        create: vi.fn().mockResolvedValue({ id: "decision_1" }),
        findMany: vi.fn().mockResolvedValue([
          { id: "decision_1", decision: "APPLY", jobPostingId: "job_1" },
        ]),
      },
      firm: {
        upsert: vi
          .fn()
          .mockResolvedValue({ id: "firm_1", name: "Acme", logoUrl: null, linkedinUrl: null }),
        update: vi
          .fn()
          .mockResolvedValue({ id: "firm_1", name: "Acme", logoUrl: null, linkedinUrl: null }),
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
    runExternalApplyDryRunFlowMock.mockReset();
    runExternalApplyFlowMock.mockReset();
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
    const confirmExternalApplicationFinished = vi.fn().mockResolvedValue(true);
    (deps.createEasyApplyDriver as any).mockResolvedValue({
      driver: true,
      confirmExternalApplicationFinished,
    });
    (deps.extractJobText as any).mockResolvedValue({
      rawText: "raw",
      title: "Engineer",
      company: "Acme",
      companyLogoUrl: "https://cdn.example.com/acme.png",
      companyLinkedinUrl: "https://www.linkedin.com/company/acme/",
      location: "Remote",
      platform: "linkedin",
      applicationType: "easy_apply",
      applyUrl: null,
      currentUrl: "https://www.linkedin.com/jobs/view/1",
      descriptionText: null,
      requirementsText: null,
      benefitsText: null,
    });
    (deps.runEasyApplyDryRun as any).mockResolvedValue({
      status: "ready_to_submit",
      steps: [{
        action: "review",
        questions: [
          {
            question: {
              fieldKey: "phone",
              label: "Phone",
              inputType: "phone",
              required: true,
            },
            resolved: {
              questionType: "contact_info",
              strategy: "deterministic",
              answer: "+905000000000",
              confidence: 0.99,
              confidenceLabel: "high",
              source: "candidate-profile",
              notes: [],
            },
            filled: true,
            details: "Filled the field.",
          },
        ],
      }],
      stopReason: "Reached the final submit step.",
      url: "https://www.linkedin.com/jobs/view/1",
    });
    (deps.writeRunReport as any).mockResolvedValue("artifacts/easy-apply-runs/run.json");

    const { runEasyApplyDryRunFlow } = await import("../../../src/app/flows/linkedinFlows.js");
    const result = await runEasyApplyDryRunFlow(
      {
        mode: "easy-apply",
        url: "https://www.linkedin.com/jobs/view/1",
        resumePath: "./resume.pdf",
        dryRun: true,
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
    expect(deps.prisma.candidateProfileSnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fullName: "Jane",
        resumePath: "./resume.pdf",
      }),
    });
    expect(deps.prisma.preparedAnswerSet.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        candidateProfileId: "snapshot_1",
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

    const { runEasyApplyDryRunFlow } = await import("../../../src/app/flows/linkedinFlows.js");
    await runEasyApplyDryRunFlow(
      {
        mode: "easy-apply",
        url: "https://www.linkedin.com/jobs/view/1",
        resumePath: "./resume.pdf",
        dryRun: true,
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
            steps: [{
              action: "review",
              questions: [
                {
                  question: {
                    fieldKey: "salary",
                    label: "Salary",
                    inputType: "number",
                    required: true,
                  },
                  resolved: {
                    questionType: "salary_expectation",
                    strategy: "deterministic",
                    answer: "80000",
                    confidence: 0.99,
                    confidenceLabel: "high",
                    source: "candidate-profile",
                    notes: [],
                  },
                  filled: true,
                  details: "Filled the field.",
                },
              ],
            }],
            stopReason: "Reached final submit.",
            url: "https://www.linkedin.com/jobs/view/1",
          },
        },
      ],
    });
    (deps.writeRunReport as any).mockResolvedValue("artifacts/batch-runs/run.json");

    const { runEasyApplyDryRunFlow } = await import("../../../src/app/flows/linkedinFlows.js");
    const result = await runEasyApplyDryRunFlow(
      {
        mode: "easy-apply-batch",
        url: "https://www.linkedin.com/jobs/collections/easy-apply",
        resumePath: "./resume.pdf",
        count: 2,
        disableAiEvaluation: false,
        scoreThreshold: 60,
        useAiScoreAdjustment: false,
        dryRun: true,
      },
      deps,
    );

    expect(result.reportPath).toBe("artifacts/batch-runs/run.json");
    expect(deps.runEasyApplyBatchDryRun).toHaveBeenCalledTimes(1);
    expect(deps.prisma.jobReviewHistory.create).toHaveBeenCalledTimes(2);
    expect(deps.prisma.preparedAnswerSet.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        candidateProfileId: "snapshot_1",
      }),
    });
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

  it("records external handoff results only for LinkedIn apply batch runs", async () => {
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
            status: "stopped_external_apply",
            steps: [],
            stopReason: "This LinkedIn job redirects to an external application page.",
            url: "https://www.linkedin.com/jobs/view/1",
            externalApplyUrl: "https://company.example/apply",
          },
        },
      ],
    });
    runExternalApplyDryRunFlowMock.mockResolvedValue({
      finalStage: "final_submit_step",
      stopReason: "Filled 4 field(s) and reached the final submit step without submitting.",
      discovery: {
        platform: "workable",
      },
      reportPath: "artifacts/external-apply-runs/run.json",
    });
    (deps.writeRunReport as any).mockResolvedValue("artifacts/batch-runs/run.json");

    const { runApplyDryRunFlow } = await import("../../../src/app/flows/applyFlows.js");
    await runApplyDryRunFlow(
      {
        mode: "apply-batch",
        url: "https://www.linkedin.com/jobs/collections/easy-apply",
        resumePath: "./resume.pdf",
        count: 1,
        disableAiEvaluation: false,
        scoreThreshold: 40,
        useAiScoreAdjustment: false,
        dryRun: true,
      },
      deps,
    );

    expect(deps.prisma.jobReviewHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobUrl: "https://www.linkedin.com/jobs/view/1",
        status: "READY_TO_SUBMIT",
        decision: "APPLY",
        summary: "This LinkedIn job redirects to an external application page.",
        detailsJson: expect.stringContaining("\"canonicalUrl\":\"https://company.example/apply\""),
      }),
    });
    expect(runExternalApplyDryRunFlowMock).toHaveBeenCalledWith(
      {
        mode: "external-apply",
        url: "https://company.example/apply",
        resumePath: "./resume.pdf",
        dryRun: true,
      },
      deps,
      {
        originalJobUrl: "https://www.linkedin.com/jobs/view/1",
      },
    );
    expect(evaluationPage.close).toHaveBeenCalledTimes(1);
  });

  it("emits an audit error when batch returns approved jobs without processing results", async () => {
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
      status: "partial",
      collectionUrl: "https://www.linkedin.com/jobs/collections/easy-apply",
      requestedCount: 1,
      attemptedCount: 0,
      evaluatedCount: 1,
      skippedCount: 0,
      pagesVisited: 1,
      stopReason: "Stopped before processing.",
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
        },
      ],
    });
    (deps.writeRunReport as any).mockResolvedValue("artifacts/batch-runs/live.json");

    const { runEasyApplyBatchFlow } = await import("../../../src/app/flows/linkedinFlows.js");
    await runEasyApplyBatchFlow(
      {
        mode: "easy-apply-batch",
        url: "https://www.linkedin.com/jobs/collections/easy-apply",
        resumePath: "./resume.pdf",
        count: 1,
        disableAiEvaluation: false,
        scoreThreshold: 60,
        useAiScoreAdjustment: false,
        dryRun: false,
      },
      deps,
    );

    expect(deps.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        jobUrl: "https://www.linkedin.com/jobs/view/1",
        collectionUrl: "https://www.linkedin.com/jobs/collections/easy-apply",
        reason: "approved_job_missing_processing_result",
      }),
      "Approved batch job lost its processing result; synthesized a failure result",
    );
    expect(deps.prisma.systemLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        level: "ERROR",
        scope: "linkedin.batch.audit",
        message: "Approved batch jobs lost their processing result and were repaired for observability.",
      }),
    });
    expect(deps.writeRunReport).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "batch-runs",
        payload: expect.objectContaining({
          result: expect.objectContaining({
            jobs: [
              expect.objectContaining({
                url: "https://www.linkedin.com/jobs/view/1",
                result: expect.objectContaining({
                  status: "stopped_unknown_action",
                }),
              }),
            ],
          }),
        }),
      }),
    );
    expect(evaluationPage.close).toHaveBeenCalledTimes(1);
  });

  it("keeps approved batch jobs observable for regression case 4386362641 when processing result goes missing", async () => {
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
      status: "partial",
      collectionUrl: "https://www.linkedin.com/jobs/collections/easy-apply",
      requestedCount: 1,
      attemptedCount: 0,
      evaluatedCount: 1,
      skippedCount: 0,
      pagesVisited: 1,
      stopReason: "Stopped before processing.",
      jobs: [
        {
          url: "https://www.linkedin.com/jobs/view/4386362641",
          evaluation: {
            shouldApply: true,
            finalDecision: "APPLY",
            score: 58,
            reason: "Configured workplace-policy bypass matched this job location, so the role will be applied.",
            policyAllowed: true,
          },
        },
      ],
    });
    (deps.writeRunReport as any).mockResolvedValue("artifacts/batch-runs/live.json");

    const { runEasyApplyBatchFlow } = await import("../../../src/app/flows/linkedinFlows.js");
    await runEasyApplyBatchFlow(
      {
        mode: "easy-apply-batch",
        url: "https://www.linkedin.com/jobs/collections/easy-apply",
        resumePath: "./resume.pdf",
        count: 1,
        disableAiEvaluation: false,
        scoreThreshold: 40,
        useAiScoreAdjustment: false,
        dryRun: false,
      },
      deps,
    );

    expect(deps.writeRunReport).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          result: expect.objectContaining({
            jobs: [
              expect.objectContaining({
                url: "https://www.linkedin.com/jobs/view/4386362641",
                result: expect.objectContaining({
                  status: "stopped_unknown_action",
                  stopReason: expect.stringContaining("Approved job never produced a processing result"),
                }),
              }),
            ],
          }),
        }),
      }),
    );
    expect(deps.prisma.systemLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        level: "ERROR",
        scope: "linkedin.batch.audit",
        detailsJson: expect.stringContaining("4386362641"),
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

    const { runEasyApplyDryRunFlow } = await import("../../../src/app/flows/linkedinFlows.js");

    await expect(
      runEasyApplyDryRunFlow(
        {
          mode: "easy-apply",
          url: "https://www.linkedin.com/jobs/view/1",
          resumePath: "./resume.pdf",
          dryRun: true,
        },
        deps,
      ),
    ).rejects.toMatchObject({
      phase: "linkedin_easy_apply",
      code: "LINKEDIN_EASY_APPLY_FAILED",
    });
    expect(deps.logger.error).toHaveBeenCalled();
  });

  it("persists manually applied single-job dry runs as submitted applications", async () => {
    const deps = createDeps();
    mockWithPage(deps);
    (deps.loadCandidateMasterProfile as any).mockResolvedValue({
      fullName: "Jane",
      sourceMetadata: { resumePath: "./resume.pdf" },
    });
    (deps.loadCandidateProfile as any).mockResolvedValue({});
    (deps.createEasyApplyDriver as any).mockResolvedValue({ driver: true });
    (deps.extractJobText as any).mockResolvedValue({
      rawText: "raw",
      title: "Engineer",
      company: "Acme",
      companyLogoUrl: "https://cdn.example.com/acme.png",
      companyLinkedinUrl: "https://www.linkedin.com/company/acme/",
      location: "Remote",
      platform: "linkedin",
      applicationType: "easy_apply",
      applyUrl: null,
      currentUrl: "https://www.linkedin.com/jobs/view/1",
      descriptionText: null,
      requirementsText: null,
      benefitsText: null,
    });
    (deps.runEasyApplyDryRun as any).mockResolvedValue({
      status: "stopped_not_easy_apply",
      steps: [],
      stopReason: "This LinkedIn job has already been applied to.",
      url: "https://www.linkedin.com/jobs/view/1",
      alreadyApplied: true,
    });
    (deps.writeRunReport as any).mockResolvedValue("artifacts/easy-apply-runs/run.json");

    const { runEasyApplyDryRunFlow } = await import("../../../src/app/flows/linkedinFlows.js");
    await runEasyApplyDryRunFlow(
      {
        mode: "easy-apply",
        url: "https://www.linkedin.com/jobs/view/1",
        resumePath: "./resume.pdf",
        dryRun: true,
      },
      deps,
    );

    expect(deps.prisma.applicationDecision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        decision: "APPLY",
        score: 0,
        policyAllowed: true,
      }),
    });
    expect(deps.prisma.jobReviewHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "SUBMITTED",
        decision: "APPLY",
        summary: expect.stringContaining("already submitted outside the bot"),
      }),
    });
  });

  it("runs the live LinkedIn apply flow and follows external apply handoff", async () => {
    const deps = createDeps();
    mockWithPage(deps);
    (deps.loadCandidateMasterProfile as any).mockResolvedValue({
      fullName: "Jane",
      sourceMetadata: { resumePath: "./resume.pdf" },
    });
    (deps.resolveAnswer as any).mockResolvedValue({ answer: "ok" });
    const confirmExternalApplicationFinished = vi.fn().mockResolvedValue(true);
    (deps.createEasyApplyDriver as any).mockResolvedValue({
      driver: true,
      confirmExternalApplicationFinished,
    });
    (deps.runEasyApply as any).mockResolvedValue({
      status: "stopped_external_apply",
      steps: [{ action: "external" }],
      stopReason: "Use company website.",
      url: "https://www.linkedin.com/jobs/view/1",
      externalApplyUrl: "https://company.example/apply",
    });
    runExternalApplyFlowMock.mockResolvedValue({
      finalStage: "completed",
      stopReason: "Submitted the application successfully after filling 6 field(s).",
      discovery: {
        platform: "workable",
      },
      reportPath: "artifacts/external-apply-runs/live.json",
    });
    (deps.writeRunReport as any).mockResolvedValue("artifacts/easy-apply-runs/live.json");

    const { runApplyFlow } = await import("../../../src/app/flows/applyFlows.js");
    const result = await runApplyFlow(
      {
        mode: "apply",
        url: "https://www.linkedin.com/jobs/view/1",
        resumePath: "./resume.pdf",
        dryRun: false,
      },
      deps,
    );

    expect(result.reportPath).toBe("artifacts/easy-apply-runs/live.json");
    expect(result.easyApply.externalApplication).toEqual(
      expect.objectContaining({
        canonicalUrl: "https://company.example/apply",
        status: "completed",
        finalStage: "completed",
        platform: "workable",
      }),
    );
    expect(deps.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        externalApplyUrl: "https://company.example/apply",
        externalApplication: expect.objectContaining({
          finalStage: "completed",
        }),
      }),
      "LinkedIn Easy Apply finished",
    );
    expect(runExternalApplyFlowMock).toHaveBeenCalledWith(
      {
        mode: "external-apply",
        url: "https://company.example/apply",
        resumePath: "./resume.pdf",
        dryRun: false,
      },
      deps,
      {
        originalJobUrl: "https://www.linkedin.com/jobs/view/1",
      },
    );
    expect(confirmExternalApplicationFinished).toHaveBeenCalledTimes(1);
    expect(deps.prisma.jobReviewHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "SUBMITTED",
        detailsJson: expect.stringContaining("\"finalStage\":\"completed\""),
      }),
    });
    expect(deps.prisma.systemLog.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        level: "INFO",
        scope: "linkedin.easy_apply",
        message: "LinkedIn Easy Apply finished.",
        runType: "apply",
      }),
    });
  });

  it("persists survey answers for the live easy-apply flow when questions were answered", async () => {
    const deps = createDeps();
    mockWithPage(deps);
    (deps.loadCandidateMasterProfile as any).mockResolvedValue({
      fullName: "Jane",
      linkedinUrl: "https://linkedin.com/in/jane",
      sourceMetadata: { resumePath: "./resume.pdf" },
    });
    (deps.resolveAnswer as any).mockResolvedValue({ answer: "ok" });
    (deps.createEasyApplyDriver as any).mockResolvedValue({ driver: true });
    (deps.runEasyApply as any).mockResolvedValue({
      status: "ready_to_submit",
      steps: [{
        action: "review",
        questions: [
          {
            question: {
              fieldKey: "linkedin",
              label: "LinkedIn",
              inputType: "url",
              required: false,
            },
            resolved: {
              questionType: "linkedin",
              strategy: "deterministic",
              answer: "https://linkedin.com/in/jane",
              confidence: 0.99,
              confidenceLabel: "high",
              source: "candidate-profile",
              notes: [],
            },
            filled: true,
            details: "Filled the field.",
          },
        ],
      }],
      stopReason: "Reached final submit.",
      url: "https://www.linkedin.com/jobs/view/1",
    });
    (deps.writeRunReport as any).mockResolvedValue("artifacts/easy-apply-runs/live.json");

    const { runEasyApplyFlow } = await import("../../../src/app/flows/linkedinFlows.js");
    const result = await runEasyApplyFlow(
      {
        mode: "easy-apply",
        url: "https://www.linkedin.com/jobs/view/1",
        resumePath: "./resume.pdf",
        dryRun: false,
      },
      deps,
    );

    expect(result.preparedAnswerSets).toEqual([{ id: "prepared_1" }]);
    expect(deps.prisma.preparedAnswerSet.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        candidateProfileId: "snapshot_1",
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

    const { runEasyApplyFlow } = await import("../../../src/app/flows/linkedinFlows.js");
    await runEasyApplyFlow(
      {
        mode: "easy-apply",
        url: "https://www.linkedin.com/jobs/view/1",
        resumePath: "./resume.pdf",
        dryRun: false,
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

    const { runEasyApplyBatchFlow } = await import("../../../src/app/flows/linkedinFlows.js");
    const result = await runEasyApplyBatchFlow(
      {
        mode: "easy-apply-batch",
        url: "https://www.linkedin.com/jobs/collections/easy-apply",
        resumePath: "./resume.pdf",
        count: 1,
        disableAiEvaluation: false,
        scoreThreshold: 60,
        useAiScoreAdjustment: false,
        dryRun: false,
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

  it("writes structured per-job batch observability events for discovery, decision, and processing", async () => {
    const deps = createDeps();
    const { evaluationPage } = mockWithPage(deps);
    (deps.loadCandidateMasterProfile as any).mockResolvedValue({
      fullName: "Jane",
      sourceMetadata: { resumePath: "./resume.pdf" },
    });
    (deps.loadCandidateProfile as any).mockResolvedValue({});
    (deps.resolveAnswer as any).mockResolvedValue({ answer: "ok" });
    (deps.createEasyApplyDriver as any).mockResolvedValue({ driver: true });
    (deps.runEasyApplyBatch as any).mockImplementation(async (input: any) => {
      await input.observeBatchEvent?.({
        type: "collection_opened",
        collectionUrl: input.url,
        pageNumber: 1,
      });
      await input.observeBatchEvent?.({
        type: "job_discovered",
        collectionUrl: input.url,
        jobUrl: "https://www.linkedin.com/jobs/view/1",
        pageNumber: 1,
        alreadyApplied: false,
      });
      await input.observeBatchEvent?.({
        type: "job_evaluated",
        collectionUrl: input.url,
        jobUrl: "https://www.linkedin.com/jobs/view/1",
        pageNumber: 1,
        evaluation: {
          shouldApply: true,
          finalDecision: "APPLY",
          score: 72,
          reason: "Good fit",
          policyAllowed: true,
          diagnostics: {
            title: "Engineer",
            company: "Acme",
            location: "Remote",
            applicationType: "easy_apply",
            companyInfoRead: true,
            metadataRead: true,
          },
        },
      });
      await input.observeBatchEvent?.({
        type: "job_processing_started",
        collectionUrl: input.url,
        jobUrl: "https://www.linkedin.com/jobs/view/1",
        pageNumber: 1,
        attemptIndex: 1,
        evaluation: {
          shouldApply: true,
          finalDecision: "APPLY",
          score: 72,
          reason: "Good fit",
          policyAllowed: true,
          diagnostics: {
            applicationType: "easy_apply",
          },
        },
      });
      await input.observeBatchEvent?.({
        type: "job_processing_finished",
        collectionUrl: input.url,
        jobUrl: "https://www.linkedin.com/jobs/view/1",
        pageNumber: 1,
        attemptIndex: 1,
        evaluation: {
          shouldApply: true,
          finalDecision: "APPLY",
          score: 72,
          reason: "Good fit",
          policyAllowed: true,
        },
        result: {
          status: "stopped_external_apply",
          steps: [],
          stopReason: "This LinkedIn job redirects to an external application page.",
          url: "https://www.linkedin.com/jobs/view/1",
          externalApplyUrl: "https://company.example/apply",
        },
      });

      return {
        status: "completed",
        collectionUrl: input.url,
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
              status: "stopped_external_apply",
              steps: [],
              stopReason: "This LinkedIn job redirects to an external application page.",
              url: "https://www.linkedin.com/jobs/view/1",
              externalApplyUrl: "https://company.example/apply",
            },
          },
        ],
      };
    });
    (deps.writeRunReport as any).mockResolvedValue("artifacts/batch-runs/live.json");

    const { runApplyBatchFlow } = await import("../../../src/app/flows/applyFlows.js");
    await runApplyBatchFlow(
      {
        mode: "apply-batch",
        url: "https://www.linkedin.com/jobs/collections/easy-apply",
        resumePath: "./resume.pdf",
        count: 1,
        disableAiEvaluation: false,
        scoreThreshold: 60,
        useAiScoreAdjustment: false,
        dryRun: false,
      },
      deps,
    );

    expect(deps.prisma.systemLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scope: "linkedin.batch",
        message: "Discovered job on LinkedIn collection page.",
        jobUrl: "https://www.linkedin.com/jobs/view/1",
      }),
    });
    expect(deps.prisma.systemLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scope: "linkedin.batch",
        message: "Recorded batch decision for job.",
        jobUrl: "https://www.linkedin.com/jobs/view/1",
        detailsJson: expect.stringContaining("\"applicationType\":\"easy_apply\""),
      }),
    });
    expect(deps.prisma.systemLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scope: "linkedin.batch",
        message: "Finished application processing for approved job.",
        jobUrl: "https://www.linkedin.com/jobs/view/1",
        detailsJson: expect.stringContaining("\"externalApplyUrl\":\"https://company.example/apply\""),
      }),
    });
    expect(evaluationPage.close).toHaveBeenCalledTimes(1);
  });

  it("persists manually applied batch jobs as submitted applications and skips duplicate skip-history records", async () => {
    const deps = createDeps();
    const { evaluationPage } = mockWithPage(deps);
    (deps.loadCandidateMasterProfile as any).mockResolvedValue({
      fullName: "Jane",
      sourceMetadata: { resumePath: "./resume.pdf" },
    });
    (deps.loadCandidateProfile as any).mockResolvedValue({});
    (deps.resolveAnswer as any).mockResolvedValue({ answer: "ok" });
    (deps.createEasyApplyDriver as any).mockResolvedValue({ driver: true });
    (deps.extractJobText as any).mockResolvedValue({
      rawText: "raw",
      title: "Engineer",
      company: "Acme",
      companyLogoUrl: "https://cdn.example.com/acme.png",
      companyLinkedinUrl: "https://www.linkedin.com/company/acme/",
      location: "Remote",
      platform: "linkedin",
      applicationType: "easy_apply",
      applyUrl: null,
      currentUrl: "https://www.linkedin.com/jobs/view/1",
      descriptionText: null,
      requirementsText: null,
      benefitsText: null,
    });
    (deps.runEasyApplyBatch as any).mockResolvedValue({
      status: "completed",
      collectionUrl: "https://www.linkedin.com/jobs/collections/easy-apply",
      requestedCount: 1,
      attemptedCount: 0,
      evaluatedCount: 1,
      skippedCount: 1,
      pagesVisited: 1,
      stopReason: "Processed 0 job.",
      jobs: [
        {
          url: "https://www.linkedin.com/jobs/view/1",
          evaluation: {
            shouldApply: false,
            finalDecision: "SKIP",
            score: 0,
            reason: "Job already has a LinkedIn applied badge.",
            policyAllowed: true,
            alreadyApplied: true,
          },
        },
      ],
    });
    (deps.writeRunReport as any).mockResolvedValue("artifacts/batch-runs/live.json");

    const { runEasyApplyBatchFlow } = await import("../../../src/app/flows/linkedinFlows.js");
    await runEasyApplyBatchFlow(
      {
        mode: "easy-apply-batch",
        url: "https://www.linkedin.com/jobs/collections/easy-apply",
        resumePath: "./resume.pdf",
        count: 1,
        disableAiEvaluation: false,
        scoreThreshold: 60,
        dryRun: false,
      },
      deps,
    );

    expect(deps.prisma.applicationDecision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        decision: "APPLY",
      }),
    });
    expect(deps.prisma.jobReviewHistory.create).toHaveBeenCalledTimes(1);
    expect(deps.prisma.jobReviewHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "SUBMITTED",
        decision: "APPLY",
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

    const { runEasyApplyBatchFlow } = await import("../../../src/app/flows/linkedinFlows.js");
    await runEasyApplyBatchFlow(
      {
        mode: "easy-apply-batch",
        url: "https://www.linkedin.com/jobs/collections/easy-apply",
        resumePath: "./resume.pdf",
        count: 1,
        disableAiEvaluation: true,
        scoreThreshold: 60,
        useAiScoreAdjustment: false,
        dryRun: false,
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

    const { runEasyApplyBatchFlow } = await import("../../../src/app/flows/linkedinFlows.js");

    await expect(
      runEasyApplyBatchFlow(
        {
          mode: "easy-apply-batch",
          url: "https://www.linkedin.com/jobs/collections/easy-apply",
          resumePath: "./resume.pdf",
          count: 1,
          disableAiEvaluation: false,
          scoreThreshold: 60,
          useAiScoreAdjustment: false,
          dryRun: false,
        },
        deps,
      ),
    ).rejects.toMatchObject({
      phase: "linkedin_easy_apply",
      code: "LINKEDIN_EASY_APPLY_FAILED",
    });
  });
});
