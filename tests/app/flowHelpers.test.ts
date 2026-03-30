import { describe, expect, it, vi } from "vitest";
import {
  createBatchJobEvaluator,
  createCandidateAnswerResolver,
  loadMasterProfileForArgs,
} from "../../src/app/flowHelpers.js";

function createDeps() {
  const scoreJob = vi.fn();
  const scoreJobWithAi = vi.fn().mockImplementation(async (...args) => scoreJob(...args));

  return {
    loadCandidateMasterProfile: vi.fn(),
    resolveAnswer: vi.fn(),
    prisma: {
      firm: {
        upsert: vi.fn().mockResolvedValue({ id: "firm_1", name: "Acme" }),
        update: vi.fn().mockResolvedValue({ id: "firm_1", name: "Acme" }),
      },
      jobPosting: {
        upsert: vi.fn().mockResolvedValue({ id: "job_1", company: "Acme" }),
        findUnique: vi.fn().mockResolvedValue(null),
      },
      applicationDecision: {
        create: vi.fn().mockResolvedValue({ id: "decision_1" }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      jobReviewHistory: {
        findFirst: vi.fn(),
        create: vi.fn().mockResolvedValue({}),
      },
      systemLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    },
    logger: {
      warn: vi.fn(),
      info: vi.fn(),
    },
    extractJobText: vi.fn(),
    formatJobForLLM: vi.fn(),
    parseJob: vi.fn(),
    completePrompt: vi.fn(),
    normalizeParsedJob: vi.fn(),
    scoreJob,
    scoreJobWithAi,
    evaluatePolicy: vi.fn(),
    withPage: vi.fn(),
    writeRunReport: vi.fn(),
    getConfiguredProviderInfo: vi.fn(),
    loadCandidateProfile: vi.fn(),
    decideJob: vi.fn(),
    runEasyApply: vi.fn(),
    runEasyApplyBatch: vi.fn(),
    runEasyApplyDryRun: vi.fn(),
    runEasyApplyBatchDryRun: vi.fn(),
    createEasyApplyDriver: vi.fn(),
  } as any;
}

describe("app flow helpers", () => {
  it("loads the master profile with an optional LinkedIn URL", async () => {
    const deps = createDeps();
    deps.loadCandidateMasterProfile.mockResolvedValue({ ok: true });

    await loadMasterProfileForArgs(
      { resumePath: "./resume.pdf", linkedinUrl: "https://linkedin.com/in/test" },
      deps,
    );
    await loadMasterProfileForArgs({ resumePath: "./resume.pdf" }, deps);

    expect(deps.loadCandidateMasterProfile).toHaveBeenNthCalledWith(1, {
      resumePath: "./resume.pdf",
      linkedinUrl: "https://linkedin.com/in/test",
    });
    expect(deps.loadCandidateMasterProfile).toHaveBeenNthCalledWith(2, {
      resumePath: "./resume.pdf",
    });
  });

  it("creates a candidate answer resolver that prefers the override profile", async () => {
    const deps = createDeps();
    deps.resolveAnswer.mockResolvedValue({ answer: "ok" });
    const baseProfile = { fullName: "Base" };
    const overrideProfile = { fullName: "Override" };
    const resolve = createCandidateAnswerResolver(baseProfile as any, deps);

    await resolve({ question: { label: "Q1" } as any, candidateProfile: overrideProfile as any });
    await resolve({ question: { label: "Q2" } as any, candidateProfile: undefined as any });

    expect(deps.resolveAnswer).toHaveBeenNthCalledWith(1, {
      question: { label: "Q1" },
      candidateProfile: overrideProfile,
    });
    expect(deps.resolveAnswer).toHaveBeenNthCalledWith(2, {
      question: { label: "Q2" },
      candidateProfile: baseProfile,
    });
  });

  it("returns an immediate APPLY evaluation when AI evaluation is disabled", async () => {
    const deps = createDeps();
    const evaluate = createBatchJobEvaluator({
      disableAiEvaluation: true,
      scoreThreshold: 60,
      useAiScoreAdjustment: false,
      scoringProfile: {} as any,
      deps,
    });

    await expect(evaluate("https://example.com/job")).resolves.toEqual({
      shouldApply: true,
      finalDecision: "APPLY",
      score: 0,
      reason: "AI evaluation disabled for this batch run.",
      policyAllowed: true,
    });
    expect(deps.extractJobText).not.toHaveBeenCalled();
  });

  it("skips duplicate reviews and persists a warning event", async () => {
    const deps = createDeps();
    deps.prisma.jobReviewHistory.findFirst.mockResolvedValue({
      createdAt: new Date("2026-03-29T00:00:00.000Z"),
      status: "SKIPPED",
      decision: "SKIP",
      score: 47,
      policyAllowed: false,
    });

    const evaluate = createBatchJobEvaluator({
      disableAiEvaluation: false,
      scoreThreshold: 60,
      useAiScoreAdjustment: false,
      scoringProfile: {} as any,
      evaluationPage: { fake: true } as any,
      deps,
    });

    const result = await evaluate("https://example.com/job");

    expect(result).toEqual({
      shouldApply: false,
      finalDecision: "SKIP",
      score: 47,
      reason: "Job was already reviewed on 2026-03-29 with status SKIPPED, score 47, decision SKIP.",
      policyAllowed: false,
    });
    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://example.com/job" }),
      "Skipping duplicate job review",
    );
    expect(deps.extractJobText).not.toHaveBeenCalled();
  });

  it("refreshes missing job metadata before skipping a duplicate review", async () => {
    const deps = createDeps();
    deps.prisma.jobReviewHistory.findFirst.mockResolvedValue({
      createdAt: new Date("2026-03-29T00:00:00.000Z"),
      status: "SKIPPED",
      decision: "SKIP",
      score: 47,
      policyAllowed: false,
    });
    deps.prisma.jobPosting.findUnique.mockResolvedValue({
      id: "job_1",
      title: null,
      company: "Acme",
      companyLogoUrl: null,
      companyLinkedinUrl: null,
      location: null,
    });
    deps.extractJobText.mockResolvedValue({
      rawText: "raw",
      title: "Recovered Title",
      company: "Acme",
      companyLogoUrl: "https://cdn.example.com/acme.png",
      companyLinkedinUrl: "https://www.linkedin.com/company/acme/",
      location: "Remote",
      platform: "linkedin",
      applicationType: "easy_apply",
      applyUrl: "https://example.com/apply",
      currentUrl: "https://example.com/job",
      descriptionText: "desc",
      requirementsText: "req",
      benefitsText: "benefits",
    });

    const evaluate = createBatchJobEvaluator({
      disableAiEvaluation: false,
      scoreThreshold: 60,
      useAiScoreAdjustment: false,
      scoringProfile: {} as any,
      evaluationPage: { fake: true } as any,
      deps,
    });

    await evaluate("https://example.com/job");

    expect(deps.extractJobText).toHaveBeenCalledWith(
      { fake: true },
      "https://example.com/job",
    );
    expect(deps.prisma.jobPosting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          title: "Recovered Title",
          companyLogoUrl: "https://cdn.example.com/acme.png",
          companyLinkedinUrl: "https://www.linkedin.com/company/acme/",
          location: "Remote",
        }),
      }),
    );
  });

  it("handles duplicate reviews without score or policyAllowed by falling back safely", async () => {
    const deps = createDeps();
    deps.prisma.jobReviewHistory.findFirst.mockResolvedValue({
      createdAt: new Date("2026-03-29T00:00:00.000Z"),
      status: "FAILED",
      decision: null,
      score: null,
      policyAllowed: null,
    });

    const evaluate = createBatchJobEvaluator({
      disableAiEvaluation: false,
      scoreThreshold: 60,
      useAiScoreAdjustment: false,
      scoringProfile: {} as any,
      evaluationPage: { fake: true } as any,
      deps,
    });

    deps.extractJobText.mockResolvedValue({
      rawText: "raw",
      title: "Job",
      company: "Acme",
      companyLogoUrl: null,
      companyLinkedinUrl: null,
      location: "Remote",
      platform: "linkedin",
    });
    deps.formatJobForLLM.mockReturnValue("prompt");
    deps.parseJob.mockResolvedValue({ parsed: { title: "Job" } });
    deps.normalizeParsedJob.mockReturnValue({ platform: "linkedin" });
    deps.scoreJob.mockReturnValue({ totalScore: 61 });
    deps.evaluatePolicy.mockReturnValue({ allowed: true, reasons: [] });

    await expect(evaluate("https://example.com/job")).resolves.toEqual({
      shouldApply: true,
      finalDecision: "APPLY",
      score: 61,
      reason: "Score 61 meets the configured threshold of 60.",
      policyAllowed: true,
    });
    expect(deps.extractJobText).toHaveBeenCalledWith(
      { fake: true },
      "https://example.com/job",
    );
  });

  it("re-evaluates jobs that only reached an intermediate evaluated state", async () => {
    const deps = createDeps();
    deps.prisma.jobReviewHistory.findFirst.mockResolvedValue({
      createdAt: new Date("2026-03-29T00:00:00.000Z"),
      status: "EVALUATED",
      decision: "APPLY",
      score: 47,
      policyAllowed: true,
    });
    deps.createEasyApplyDriver.mockResolvedValue({
      ensureAuthenticated: vi.fn().mockResolvedValue(undefined),
      open: vi.fn().mockResolvedValue(undefined),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(false),
      isAlreadyApplied: vi.fn().mockResolvedValue(false),
    });
    deps.extractJobText.mockResolvedValue({
      rawText: "raw",
      title: "Job",
      company: "Acme",
      companyLogoUrl: null,
      companyLinkedinUrl: null,
      location: "Remote",
      platform: "linkedin",
    });
    deps.formatJobForLLM.mockReturnValue("prompt");
    deps.parseJob.mockResolvedValue({ parsed: { title: "Job" } });
    deps.normalizeParsedJob.mockReturnValue({ platform: "linkedin" });
    deps.scoreJob.mockReturnValue({ totalScore: 75 });
    deps.evaluatePolicy.mockReturnValue({ allowed: true, reasons: [] });

    const evaluate = createBatchJobEvaluator({
      disableAiEvaluation: false,
      scoreThreshold: 60,
      useAiScoreAdjustment: false,
      scoringProfile: {} as any,
      evaluationPage: { fake: true } as any,
      deps,
    });

    await expect(evaluate("https://example.com/job")).resolves.toEqual({
      shouldApply: true,
      finalDecision: "APPLY",
      score: 75,
      reason: "Score 75 meets the configured threshold of 60.",
      policyAllowed: true,
    });
  });

  it("retries previously approved jobs when easy apply is still active", async () => {
    const deps = createDeps();
    deps.prisma.jobReviewHistory.findFirst.mockResolvedValue({
      createdAt: new Date("2026-03-30T00:00:00.000Z"),
      status: "EVALUATED",
      decision: "APPLY",
      score: 60,
      policyAllowed: true,
    });
    deps.createEasyApplyDriver.mockResolvedValue({
      ensureAuthenticated: vi.fn().mockResolvedValue(undefined),
      open: vi.fn().mockResolvedValue(undefined),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      isAlreadyApplied: vi.fn().mockResolvedValue(false),
    });

    const evaluate = createBatchJobEvaluator({
      disableAiEvaluation: false,
      scoreThreshold: 60,
      useAiScoreAdjustment: false,
      scoringProfile: {} as any,
      evaluationPage: { fake: true } as any,
      deps,
    });

    await expect(evaluate("https://example.com/job")).resolves.toEqual({
      shouldApply: true,
      finalDecision: "APPLY",
      score: 60,
      reason:
        "Job was previously approved and Easy Apply is still available, so the application flow will be retried.",
      policyAllowed: true,
    });
    expect(deps.extractJobText).not.toHaveBeenCalled();
    expect(deps.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://example.com/job",
        previousStatus: "EVALUATED",
      }),
      "Retrying previously approved Easy Apply job",
    );
  });

  it("evaluates a job on the provided evaluation page with optional AI score adjustment", async () => {
    const deps = createDeps();
    deps.prisma.jobReviewHistory.findFirst.mockResolvedValue(null);
    deps.extractJobText.mockResolvedValue({
      rawText: "raw",
      title: "Job",
      company: "Acme",
      companyLogoUrl: "https://cdn.example.com/acme.png",
      companyLinkedinUrl: "https://www.linkedin.com/company/acme/",
      location: "Remote",
      platform: "linkedin",
    });
    deps.formatJobForLLM.mockReturnValue("prompt");
    deps.parseJob.mockResolvedValue({ parsed: { title: "Job" } });
    deps.normalizeParsedJob.mockReturnValue({ platform: "linkedin" });
    deps.scoreJobWithAi.mockResolvedValue({ totalScore: 62 });
    deps.evaluatePolicy.mockReturnValue({ allowed: true, reasons: [] });

    const evaluationPage = { fake: true };
    const evaluate = createBatchJobEvaluator({
      disableAiEvaluation: false,
      scoreThreshold: 60,
      useAiScoreAdjustment: true,
      scoringProfile: {} as any,
      evaluationPage: evaluationPage as any,
      deps,
    });

    const result = await evaluate("https://example.com/job");

    expect(result).toEqual({
      shouldApply: true,
      finalDecision: "APPLY",
      score: 62,
      reason: "Score 62 meets the configured threshold of 60.",
      policyAllowed: true,
    });
    expect(deps.extractJobText).toHaveBeenCalledWith(evaluationPage, "https://example.com/job");
    expect(deps.scoreJobWithAi).toHaveBeenCalledTimes(1);
    expect(deps.prisma.jobReviewHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobPostingId: "job_1",
        jobUrl: "https://example.com/job",
        source: "easy-apply-batch",
        status: "EVALUATED",
        score: 62,
        threshold: 60,
        decision: "APPLY",
        policyAllowed: true,
        platform: "linkedin",
      }),
    });
  });

  it("uses withPage when no evaluation page is provided and returns a threshold skip", async () => {
    const deps = createDeps();
    deps.prisma.jobReviewHistory.findFirst.mockResolvedValue(null);
    deps.extractJobText.mockResolvedValue({
      rawText: "raw",
      title: "Job",
      company: "Acme",
      companyLogoUrl: null,
      companyLinkedinUrl: null,
      location: "Remote",
      platform: "linkedin",
    });
    deps.formatJobForLLM.mockReturnValue("prompt");
    deps.parseJob.mockResolvedValue({ parsed: { title: "Job" } });
    deps.normalizeParsedJob.mockReturnValue({ platform: "linkedin" });
    deps.scoreJob.mockReturnValue({ totalScore: 40 });
    deps.evaluatePolicy.mockReturnValue({ allowed: true, reasons: [] });
    const page = { fake: "page" };
    deps.withPage.mockImplementation(async (_options: unknown, fn: (page: unknown) => Promise<unknown>) => fn(page));

    const evaluate = createBatchJobEvaluator({
      disableAiEvaluation: false,
      scoreThreshold: 60,
      useAiScoreAdjustment: false,
      scoringProfile: {} as any,
      deps,
    });

    const result = await evaluate("https://example.com/job");

    expect(deps.withPage).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      shouldApply: false,
      finalDecision: "SKIP",
      score: 40,
      reason: "Score 40 is below the configured threshold of 60.",
      policyAllowed: true,
    });
  });

  it("returns a policy skip with joined reasons", async () => {
    const deps = createDeps();
    deps.prisma.jobReviewHistory.findFirst.mockResolvedValue(null);
    deps.extractJobText.mockResolvedValue({
      rawText: "raw",
      title: "Job",
      company: "Acme",
      companyLogoUrl: null,
      companyLinkedinUrl: null,
      location: "Remote",
      platform: "linkedin",
    });
    deps.formatJobForLLM.mockReturnValue("prompt");
    deps.parseJob.mockResolvedValue({ parsed: { title: "Job" } });
    deps.normalizeParsedJob.mockReturnValue({ platform: "linkedin" });
    deps.scoreJob.mockReturnValue({ totalScore: 90 });
    deps.evaluatePolicy.mockReturnValue({
      allowed: false,
      reasons: ["On-site roles are blocked.", "Hybrid mismatch."],
    });

    const evaluate = createBatchJobEvaluator({
      disableAiEvaluation: false,
      scoreThreshold: 60,
      useAiScoreAdjustment: false,
      scoringProfile: {
        workplacePolicyBypassLocations: ["Europe"],
      } as any,
      evaluationPage: {} as any,
      deps,
    });

    const result = await evaluate("https://example.com/job");

    expect(result).toEqual({
      shouldApply: false,
      finalDecision: "SKIP",
      score: 90,
      reason: "On-site roles are blocked. Hybrid mismatch.",
      policyAllowed: false,
    });
  });

  it("forces apply for Europe-centered jobs even when the score is below threshold", async () => {
    const deps = createDeps();
    deps.prisma.jobReviewHistory.findFirst.mockResolvedValue(null);
    deps.extractJobText.mockResolvedValue({
      rawText: "raw",
      title: "Job",
      company: "Acme",
      companyLogoUrl: null,
      companyLinkedinUrl: null,
      location: "Berlin, Germany",
      platform: "linkedin",
      applicationType: "easy_apply",
    });
    deps.formatJobForLLM.mockReturnValue("prompt");
    deps.parseJob.mockResolvedValue({ parsed: { title: "Job" } });
    deps.normalizeParsedJob.mockReturnValue({
      title: "Job",
      company: "Acme",
      location: "Berlin, Germany",
      remoteType: "onsite",
      seniority: "mid",
      mustHaveSkills: [],
      niceToHaveSkills: [],
      technologies: ["TypeScript"],
      yearsRequired: 3,
      platform: "linkedin",
      applicationType: "easy_apply",
      visaSponsorship: "yes",
      workAuthorization: "authorized",
      openQuestionsCount: 0,
    });
    deps.scoreJob.mockReturnValue({ totalScore: 12 });
    deps.evaluatePolicy.mockReturnValue({ allowed: true, reasons: [] });

    const evaluate = createBatchJobEvaluator({
      disableAiEvaluation: false,
      scoreThreshold: 60,
      useAiScoreAdjustment: false,
      scoringProfile: { workplacePolicyBypassLocations: ["Europe"] } as any,
      evaluationPage: {} as any,
      deps,
    });

    const result = await evaluate("https://example.com/job");

    expect(result).toEqual({
      shouldApply: true,
      finalDecision: "APPLY",
      score: 12,
      reason: "Configured workplace-policy bypass matched this job location, so the role will be applied.",
      policyAllowed: true,
    });
  });

  it("persists history without a platform when normalization did not infer one", async () => {
    const deps = createDeps();
    deps.prisma.jobReviewHistory.findFirst.mockResolvedValue(null);
    deps.extractJobText.mockResolvedValue({
      rawText: "raw",
      title: "Job",
      company: "Acme",
      companyLogoUrl: null,
      companyLinkedinUrl: null,
      location: "Remote",
      platform: "linkedin",
    });
    deps.formatJobForLLM.mockReturnValue("prompt");
    deps.parseJob.mockResolvedValue({ parsed: { title: "Job" } });
    deps.normalizeParsedJob.mockReturnValue({});
    deps.scoreJob.mockReturnValue({ totalScore: 80 });
    deps.evaluatePolicy.mockReturnValue({ allowed: true, reasons: [] });

    const evaluate = createBatchJobEvaluator({
      disableAiEvaluation: false,
      scoreThreshold: 60,
      useAiScoreAdjustment: false,
      scoringProfile: {} as any,
      evaluationPage: {} as any,
      deps,
    });

    await evaluate("https://example.com/job");

    expect(deps.prisma.jobReviewHistory.create).toHaveBeenCalledWith({
      data: expect.not.objectContaining({
        platform: expect.anything(),
      }),
    });
  });
});
