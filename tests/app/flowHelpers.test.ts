import { describe, expect, it, vi } from "vitest";
import {
  createBatchJobEvaluator,
  createCandidateAnswerResolver,
  loadMasterProfileForArgs,
} from "../../src/app/flowHelpers.js";
import { evaluatePolicy as evaluateJobPolicy } from "../../src/policy/policyEngine.js";

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
      jobRecommendation: {
        upsert: vi.fn().mockResolvedValue({ id: "recommendation_1" }),
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

function createScoringProfile() {
  return {
    excludedRoles: ["Senior", "Lead", "Staff"],
    disallowedRoleKeywords: ["ios", "android", "mechanical", "researcher"],
    preferredTechStack: ["TypeScript", "Node.js"],
    aspirationalTechStack: ["React", "Next.js"],
    preferredRoleOverlapSignals: ["frontend", "front-end", "full stack", "fullstack"],
    excludedLocations: ["Istanbul onsite"],
    allowedHybridLocations: ["Ankara", "Izmir", "EskiSehir", "Eskisehir", "Samsun"],
    workplacePolicyBypassLocations: ["Europe"],
    visaRequirement: "required",
    workAuthorizationStatus: "authorized",
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

  it("extracts applied-state evidence but skips parsing and scoring when AI evaluation is disabled", async () => {
    const deps = createDeps();
    deps.extractJobText.mockResolvedValue({
      title: null,
      company: null,
      companyLogoUrl: null,
      companyLinkedinUrl: null,
      location: null,
      applicationType: "external",
      alreadyApplied: false,
    });
    const evaluate = createBatchJobEvaluator({
      disableAiEvaluation: true,
      scoreThreshold: 60,
      scoringMode: "local",
      scoringProfile: {} as any,
      evaluationPage: { fake: true } as any,
      deps,
    });

    await expect(evaluate("https://example.com/job")).resolves.toEqual({
      shouldApply: true,
      finalDecision: "APPLY",
      score: 0,
      reason: "AI evaluation disabled for this batch run.",
      policyAllowed: true,
      diagnostics: {
        title: null,
        company: null,
        location: null,
        companyLinkedinUrl: null,
        applicationType: "external",
        alreadyApplied: false,
        rawWorkplaceType: null,
        rawApplicationType: "external",
        locationSource: null,
        metadataRead: false,
        companyInfoRead: false,
      },
    });
    expect(deps.extractJobText).toHaveBeenCalledOnce();
    expect(deps.parseJob).not.toHaveBeenCalled();
    expect(deps.scoreJob).not.toHaveBeenCalled();
  });

  it("skips an already-applied job even when AI evaluation is disabled", async () => {
    const deps = createDeps();
    deps.extractJobText.mockResolvedValue({
      title: "Backend Developer",
      company: "Acme",
      companyLogoUrl: null,
      companyLinkedinUrl: null,
      location: "Remote",
      platform: "kariyer",
      applicationType: "unknown",
      alreadyApplied: true,
    });
    const evaluate = createBatchJobEvaluator({
      disableAiEvaluation: true,
      scoreThreshold: 60,
      scoringMode: "local",
      scoringProfile: {} as any,
      evaluationPage: { fake: true } as any,
      deps,
    });

    await expect(
      evaluate("https://www.kariyer.net/is-ilani/acme-backend-developer-4599999"),
    ).resolves.toMatchObject({
      shouldApply: false,
      finalDecision: "SKIP",
      score: 0,
      alreadyApplied: true,
    });
    expect(deps.parseJob).not.toHaveBeenCalled();
    expect(deps.scoreJob).not.toHaveBeenCalled();
    expect(deps.scoreJobWithAi).not.toHaveBeenCalled();
  });

  it("skips parser and score evaluation when extraction detects an existing application", async () => {
    const deps = createDeps();
    deps.extractJobText.mockResolvedValue({
      rawText: "Application Status: already_applied",
      title: "Backend Developer",
      company: "Acme",
      companyLogoUrl: null,
      companyLinkedinUrl: null,
      location: "Remote",
      platform: "linkedin",
      applicationType: "unknown",
      alreadyApplied: true,
      applyUrl: null,
      currentUrl: "https://www.linkedin.com/jobs/view/123",
      descriptionText: "Backend role",
      requirementsText: null,
      benefitsText: null,
    });
    const evaluate = createBatchJobEvaluator({
      disableAiEvaluation: false,
      scoreThreshold: 60,
      scoringMode: "ai",
      scoringProfile: {} as any,
      evaluationPage: { fake: true } as any,
      deps,
    });

    await expect(evaluate("https://www.linkedin.com/jobs/view/123")).resolves.toMatchObject({
      shouldApply: false,
      finalDecision: "SKIP",
      score: 0,
      alreadyApplied: true,
      policyAllowed: true,
      reason: expect.stringContaining("already applied"),
    });
    expect(deps.formatJobForLLM).not.toHaveBeenCalled();
    expect(deps.parseJob).not.toHaveBeenCalled();
    expect(deps.scoreJob).not.toHaveBeenCalled();
    expect(deps.scoreJobWithAi).not.toHaveBeenCalled();
    expect(deps.evaluatePolicy).not.toHaveBeenCalled();
    expect(deps.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://www.linkedin.com/jobs/view/123",
        platform: "linkedin",
      }),
      "Skipping score evaluation for already-applied job",
    );
  });

  it("still skips duplicate reviews when AI evaluation is disabled", async () => {
    const deps = createDeps();
    deps.prisma.jobReviewHistory.findFirst.mockResolvedValue({
      createdAt: new Date("2026-03-29T00:00:00.000Z"),
      status: "SUBMITTED",
      decision: "APPLY",
      score: 47,
      policyAllowed: true,
    });

    const evaluate = createBatchJobEvaluator({
      disableAiEvaluation: true,
      scoreThreshold: 60,
      scoringMode: "local",
      scoringProfile: {} as any,
      evaluationPage: { fake: true } as any,
      deps,
    });

    await expect(evaluate("https://example.com/job")).resolves.toEqual({
      shouldApply: false,
      finalDecision: "SKIP",
      score: 47,
      reason: "Job was already reviewed on 2026-03-29 with status SUBMITTED, score 47, decision APPLY.",
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
      scoringMode: "local",
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
      scoringMode: "local",
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

  it("blocks AI when a previous review has no score or policy decision", async () => {
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
      scoringMode: "local",
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

    await expect(evaluate("https://example.com/job")).resolves.toMatchObject({
      shouldApply: false,
      finalDecision: "SKIP",
      score: 0,
      reason:
        "Job was already reviewed on 2026-03-29 with status FAILED, no score.",
      policyAllowed: true,
    });
    expect(deps.extractJobText).not.toHaveBeenCalled();
    expect(deps.formatJobForLLM).not.toHaveBeenCalled();
    expect(deps.parseJob).not.toHaveBeenCalled();
    expect(deps.scoreJob).not.toHaveBeenCalled();
    expect(deps.scoreJobWithAi).not.toHaveBeenCalled();
  });

  it("blocks AI when only a legacy application decision exists", async () => {
    const deps = createDeps();
    deps.prisma.jobReviewHistory.findFirst.mockResolvedValue(null);
    deps.prisma.jobPosting.findUnique.mockResolvedValue({
      id: "job_legacy",
      url: "https://example.com/job",
      title: "Backend Engineer",
      company: "Acme",
      companyLogoUrl: "https://cdn.example.com/acme.png",
      companyLinkedinUrl: "https://www.linkedin.com/company/acme/",
      location: "Remote",
      platform: "greenhouse",
      decisions: [
        {
          id: "decision_legacy",
          score: 55,
          decision: "SKIP",
          policyAllowed: true,
          reasons: JSON.stringify(["Previously reviewed."]),
          createdAt: new Date("2026-08-31T10:00:00.000Z"),
        },
      ],
    });

    const evaluate = createBatchJobEvaluator({
      disableAiEvaluation: false,
      scoreThreshold: 60,
      scoringMode: "ai",
      scoringProfile: {} as any,
      evaluationPage: { fake: true } as any,
      deps,
    });

    await expect(evaluate("https://example.com/job")).resolves.toMatchObject({
      shouldApply: false,
      finalDecision: "SKIP",
      score: 55,
    });
    expect(deps.extractJobText).not.toHaveBeenCalled();
    expect(deps.parseJob).not.toHaveBeenCalled();
    expect(deps.scoreJobWithAi).not.toHaveBeenCalled();
  });

  it("fails closed without AI when review history cannot be verified", async () => {
    const deps = createDeps();
    deps.prisma.jobReviewHistory.findFirst.mockRejectedValue(
      new Error("db down"),
    );

    const evaluate = createBatchJobEvaluator({
      disableAiEvaluation: false,
      scoreThreshold: 60,
      scoringMode: "ai",
      scoringProfile: {} as any,
      evaluationPage: { fake: true } as any,
      deps,
    });

    await expect(evaluate("https://example.com/job")).resolves.toMatchObject({
      shouldApply: false,
      finalDecision: "SKIP",
      policyAllowed: false,
      reason:
        "Job review history could not be verified, so AI evaluation was blocked.",
    });
    expect(deps.extractJobText).not.toHaveBeenCalled();
    expect(deps.parseJob).not.toHaveBeenCalled();
    expect(deps.scoreJobWithAi).not.toHaveBeenCalled();
  });

  it("reuses an approved intermediate review without AI evaluation", async () => {
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
      scoringMode: "local",
      scoringProfile: {} as any,
      evaluationPage: { fake: true } as any,
      deps,
    });

    await expect(evaluate("https://example.com/job")).resolves.toMatchObject({
      shouldApply: true,
      finalDecision: "APPLY",
      score: 47,
      reason:
        "Job was previously approved, so its stored decision will be reused without another AI review.",
      policyAllowed: true,
    });
    expect(deps.createEasyApplyDriver).not.toHaveBeenCalled();
    expect(deps.extractJobText).not.toHaveBeenCalled();
    expect(deps.parseJob).not.toHaveBeenCalled();
    expect(deps.scoreJob).not.toHaveBeenCalled();
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
      scoringMode: "local",
      scoringProfile: {} as any,
      evaluationPage: { fake: true } as any,
      deps,
    });

    await expect(evaluate("https://example.com/job")).resolves.toEqual({
      shouldApply: true,
      finalDecision: "APPLY",
      score: 60,
      reason:
        "Job was previously approved, so its stored decision will be reused without another AI review.",
      policyAllowed: true,
    });
    expect(deps.extractJobText).not.toHaveBeenCalled();
    expect(deps.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://example.com/job",
        previousStatus: "EVALUATED",
      }),
      "Reusing previously approved job review",
    );
  });

  it("reuses a previously approved LinkedIn job by posting id without AI evaluation", async () => {
    const deps = createDeps();
    deps.prisma.jobReviewHistory.findFirst.mockResolvedValue({
      createdAt: new Date("2026-04-23T19:57:51.195Z"),
      status: "EVALUATED",
      decision: "APPLY",
      score: 62,
      policyAllowed: true,
    });
    deps.createEasyApplyDriver.mockResolvedValue({
      ensureAuthenticated: vi.fn().mockResolvedValue(undefined),
      open: vi.fn().mockResolvedValue(undefined),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      isAlreadyApplied: vi.fn().mockResolvedValue(false),
    });
    deps.extractJobText.mockResolvedValue({
      rawText: [
        "Location: Istanbul / Maslak",
        "Workplace Type: hybrid",
        "Application Type: easy_apply",
        "Fully remote work is not available for this role.",
      ].join("\n"),
      title: "Full Stack Engineer",
      company: "CEIBA TELE ICU",
      companyLogoUrl: null,
      companyLinkedinUrl: "https://www.linkedin.com/company/ceiba-teleicu/life/",
      location: "Istanbul / Maslak",
      platform: "linkedin",
      applicationType: "easy_apply",
      applyUrl: "https://www.linkedin.com/jobs/view/4397794253",
      currentUrl: "https://www.linkedin.com/jobs/view/4397794253",
      descriptionText:
        "Ceiba embraces a hybrid work structure. Fully remote work is not available for this role.",
      requirementsText: "Strong Node.js, JavaScript, and React experience.",
      benefitsText: null,
    });
    deps.formatJobForLLM.mockReturnValue("prompt");
    deps.parseJob.mockResolvedValue({ parsed: { title: "Full Stack Engineer" } });
    deps.normalizeParsedJob.mockReturnValue({
      title: "Full Stack Engineer",
      company: "CEIBA TELE ICU",
      location: "Istanbul / Maslak",
      remoteType: "hybrid",
      seniority: "mid",
      mustHaveSkills: ["TypeScript", "Node.js", "React"],
      niceToHaveSkills: [],
      technologies: ["TypeScript", "Node.js", "React", "Java"],
      yearsRequired: 2,
      platform: "linkedin",
      applicationType: "easy_apply",
      visaSponsorship: "unknown",
      workAuthorization: "unknown",
      openQuestionsCount: 0,
    });
    deps.scoreJob.mockReturnValue({ totalScore: 62 });
    deps.evaluatePolicy.mockReturnValue({
      allowed: false,
      reasons: ["Hybrid roles are only allowed in configured locations."],
    });

    const evaluate = createBatchJobEvaluator({
      disableAiEvaluation: false,
      scoreThreshold: 40,
      scoringMode: "local",
      scoringProfile: createScoringProfile(),
      evaluationPage: { fake: true } as any,
      deps,
    });

    await expect(
      evaluate("https://www.linkedin.com/jobs/view/4397794253"),
    ).resolves.toMatchObject({
      shouldApply: true,
      finalDecision: "APPLY",
      score: 62,
      policyAllowed: true,
      reason:
        "Job was previously approved, so its stored decision will be reused without another AI review.",
    });
    expect(deps.createEasyApplyDriver).not.toHaveBeenCalled();
    expect(deps.extractJobText).not.toHaveBeenCalled();
    expect(deps.parseJob).not.toHaveBeenCalled();
    expect(deps.scoreJob).not.toHaveBeenCalled();
  });

  it("blocks duplicate LinkedIn skips without AI evaluation", async () => {
    const deps = createDeps();
    deps.prisma.jobReviewHistory.findFirst.mockResolvedValue({
      createdAt: new Date("2026-04-23T19:57:51.195Z"),
      status: "SKIPPED",
      decision: "SKIP",
      score: 62,
      policyAllowed: true,
    });
    deps.extractJobText.mockResolvedValue({
      rawText: [
        "Location: Istanbul / Maslak",
        "Workplace Type: hybrid",
        "Application Type: easy_apply",
        "Fully remote work is not available for this role.",
      ].join("\n"),
      title: "Full Stack Engineer",
      company: "CEIBA TELE ICU",
      companyLogoUrl: null,
      companyLinkedinUrl: "https://www.linkedin.com/company/ceiba-teleicu/life/",
      location: "Istanbul / Maslak",
      platform: "linkedin",
      applicationType: "easy_apply",
      applyUrl: "https://www.linkedin.com/jobs/view/4397794253",
      currentUrl: "https://www.linkedin.com/jobs/view/4397794253",
      descriptionText:
        "Ceiba embraces a hybrid work structure. Fully remote work is not available for this role.",
      requirementsText: "Strong Node.js, JavaScript, and React experience.",
      benefitsText: null,
    });
    deps.formatJobForLLM.mockReturnValue("prompt");
    deps.parseJob.mockResolvedValue({ parsed: { title: "Full Stack Engineer" } });
    deps.normalizeParsedJob.mockReturnValue({
      title: "Full Stack Engineer",
      company: "CEIBA TELE ICU",
      location: "Istanbul / Maslak",
      remoteType: "hybrid",
      seniority: "mid",
      mustHaveSkills: ["TypeScript", "Node.js", "React"],
      niceToHaveSkills: [],
      technologies: ["TypeScript", "Node.js", "React", "Java"],
      yearsRequired: 2,
      platform: "linkedin",
      applicationType: "easy_apply",
      visaSponsorship: "unknown",
      workAuthorization: "unknown",
      openQuestionsCount: 0,
    });
    deps.scoreJob.mockReturnValue({ totalScore: 62 });
    deps.evaluatePolicy.mockReturnValue({
      allowed: false,
      reasons: ["Hybrid roles are only allowed in configured locations."],
    });

    const evaluate = createBatchJobEvaluator({
      disableAiEvaluation: false,
      scoreThreshold: 40,
      scoringMode: "local",
      scoringProfile: createScoringProfile(),
      evaluationPage: { fake: true } as any,
      deps,
    });

    await expect(
      evaluate("https://www.linkedin.com/jobs/view/4397794253"),
    ).resolves.toMatchObject({
      shouldApply: false,
      finalDecision: "SKIP",
      score: 62,
      policyAllowed: true,
      reason:
        "Job was already reviewed on 2026-04-23 with status SKIPPED, score 62, decision SKIP.",
    });
    expect(deps.extractJobText).not.toHaveBeenCalled();
    expect(deps.parseJob).not.toHaveBeenCalled();
    expect(deps.scoreJob).not.toHaveBeenCalled();
    expect(deps.prisma.jobPosting.findUnique).toHaveBeenCalledTimes(1);
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
      scoringMode: "ai",
      scoringProfile: {} as any,
      evaluationPage: evaluationPage as any,
      deps,
    });

    const result = await evaluate("https://example.com/job");

    expect(result).toMatchObject({
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
    expect(deps.prisma.systemLog.create).not.toHaveBeenCalled();
  });

  it("persists recommendations when the evaluator is used by explore mode", async () => {
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
      applicationType: "easy_apply",
    });
    deps.formatJobForLLM.mockReturnValue("prompt");
    deps.parseJob.mockResolvedValue({ parsed: { title: "Job" } });
    deps.normalizeParsedJob.mockReturnValue({ platform: "linkedin" });
    deps.scoreJob.mockReturnValue({ totalScore: 81 });
    deps.evaluatePolicy.mockReturnValue({ allowed: true, reasons: [] });

    const evaluate = createBatchJobEvaluator({
      disableAiEvaluation: false,
      scoreThreshold: 60,
      scoringMode: "local",
      source: "explore-batch",
      systemScope: "explore.batch",
      recommendationPolicy: "all-evaluated",
      scoringProfile: {} as any,
      evaluationPage: { fake: true } as any,
      deps,
    });

    await evaluate("https://example.com/job");

    expect(deps.prisma.jobRecommendation.upsert).toHaveBeenCalledWith({
      where: { jobPostingId: "job_1" },
      update: expect.objectContaining({
        source: "explore-batch",
        score: 81,
        decision: "APPLY",
      }),
      create: expect.objectContaining({
        jobPostingId: "job_1",
        source: "explore-batch",
        score: 81,
        decision: "APPLY",
      }),
    });
    expect(deps.prisma.systemLog.create).not.toHaveBeenCalled();
  });

  it("persists recommendations for APPLY decisions during apply-batch style evaluation", async () => {
    const deps = createDeps();
    deps.prisma.jobReviewHistory.findFirst.mockResolvedValue(null);
    deps.extractJobText.mockResolvedValue({
      rawText: "raw",
      title: "Control Plane Engineer",
      company: "ClickHouse",
      companyLogoUrl: null,
      companyLinkedinUrl: "https://www.linkedin.com/company/clickhouse/",
      location: "Remote",
      platform: "linkedin",
      applicationType: "external",
    });
    deps.formatJobForLLM.mockReturnValue("prompt");
    deps.parseJob.mockResolvedValue({ parsed: { title: "Control Plane Engineer" } });
    deps.normalizeParsedJob.mockReturnValue({
      title: "Control Plane Engineer",
      company: "ClickHouse",
      location: "Remote",
      remoteType: "remote",
      seniority: "mid",
      mustHaveSkills: ["TypeScript"],
      niceToHaveSkills: [],
      technologies: ["TypeScript", "Node.js"],
      yearsRequired: 4,
      platform: "linkedin",
      applicationType: "external",
      visaSponsorship: "yes",
      workAuthorization: "authorized",
      openQuestionsCount: 0,
    });
    deps.scoreJob.mockReturnValue({ totalScore: 50 });
    deps.evaluatePolicy.mockImplementation((job: any, profile: any, options?: any) =>
      evaluateJobPolicy(job, profile, options),
    );

    const evaluate = createBatchJobEvaluator({
      disableAiEvaluation: false,
      scoreThreshold: 40,
      scoringMode: "local",
      allowExternalLinkedInApply: true,
      recommendationPolicy: "apply-only",
      source: "apply-batch",
      scoringProfile: createScoringProfile(),
      evaluationPage: { fake: true } as any,
      deps,
    });

    await expect(evaluate("https://www.linkedin.com/jobs/view/4263540414")).resolves.toMatchObject({
      shouldApply: true,
      finalDecision: "APPLY",
      score: 50,
    });

    expect(deps.prisma.jobRecommendation.upsert).toHaveBeenCalledWith({
      where: { jobPostingId: "job_1" },
      update: expect.objectContaining({
        source: "apply-batch",
        score: 50,
        decision: "APPLY",
      }),
      create: expect.objectContaining({
        jobPostingId: "job_1",
        source: "apply-batch",
        score: 50,
        decision: "APPLY",
      }),
    });
  });

  it("does not persist recommendations for skipped decisions under apply-only policy", async () => {
    const deps = createDeps();
    deps.prisma.jobReviewHistory.findFirst.mockResolvedValue(null);
    deps.extractJobText.mockResolvedValue({
      rawText: "raw",
      title: "Control Plane Engineer",
      company: "ClickHouse",
      companyLogoUrl: null,
      companyLinkedinUrl: "https://www.linkedin.com/company/clickhouse/",
      location: "Remote",
      platform: "linkedin",
      applicationType: "external",
    });
    deps.formatJobForLLM.mockReturnValue("prompt");
    deps.parseJob.mockResolvedValue({ parsed: { title: "Control Plane Engineer" } });
    deps.normalizeParsedJob.mockReturnValue({
      title: "Control Plane Engineer",
      company: "ClickHouse",
      location: "Remote",
      remoteType: "remote",
      seniority: "mid",
      mustHaveSkills: ["TypeScript"],
      niceToHaveSkills: [],
      technologies: ["TypeScript", "Node.js"],
      yearsRequired: 4,
      platform: "linkedin",
      applicationType: "external",
      visaSponsorship: "yes",
      workAuthorization: "authorized",
      openQuestionsCount: 0,
    });
    deps.scoreJob.mockReturnValue({ totalScore: 35 });
    deps.evaluatePolicy.mockImplementation((job: any, profile: any, options?: any) =>
      evaluateJobPolicy(job, profile, options),
    );

    const evaluate = createBatchJobEvaluator({
      disableAiEvaluation: false,
      scoreThreshold: 40,
      scoringMode: "local",
      allowExternalLinkedInApply: true,
      recommendationPolicy: "apply-only",
      source: "apply-batch",
      scoringProfile: createScoringProfile(),
      evaluationPage: { fake: true } as any,
      deps,
    });

    await expect(evaluate("https://www.linkedin.com/jobs/view/4263540414")).resolves.toMatchObject({
      shouldApply: false,
      finalDecision: "SKIP",
      score: 35,
    });

    expect(deps.prisma.jobRecommendation.upsert).not.toHaveBeenCalled();
  });

  it("allows linkedin external jobs during apply-batch style evaluation", async () => {
    const deps = createDeps();
    deps.prisma.jobReviewHistory.findFirst.mockResolvedValue(null);
    deps.extractJobText.mockResolvedValue({
      rawText: "raw",
      title: "Control Plane Engineer",
      company: "ClickHouse",
      companyLogoUrl: null,
      companyLinkedinUrl: "https://www.linkedin.com/company/clickhouse/",
      location: "Remote",
      platform: "linkedin",
      applicationType: "external",
    });
    deps.formatJobForLLM.mockReturnValue("prompt");
    deps.parseJob.mockResolvedValue({ parsed: { title: "Control Plane Engineer" } });
    deps.normalizeParsedJob.mockReturnValue({
      title: "Control Plane Engineer",
      company: "ClickHouse",
      location: "Remote",
      remoteType: "remote",
      seniority: "mid",
      mustHaveSkills: ["TypeScript"],
      niceToHaveSkills: [],
      technologies: ["TypeScript", "Node.js"],
      yearsRequired: 4,
      platform: "linkedin",
      applicationType: "external",
      visaSponsorship: "yes",
      workAuthorization: "authorized",
      openQuestionsCount: 0,
    });
    deps.scoreJob.mockReturnValue({ totalScore: 50 });
    deps.evaluatePolicy.mockImplementation((job: any, profile: any, options?: any) =>
      evaluateJobPolicy(job, profile, options),
    );

    const evaluate = createBatchJobEvaluator({
      disableAiEvaluation: false,
      scoreThreshold: 40,
      scoringMode: "local",
      allowExternalLinkedInApply: true,
      scoringProfile: createScoringProfile(),
      evaluationPage: { fake: true } as any,
      deps,
    });

    await expect(evaluate("https://www.linkedin.com/jobs/view/4263540414")).resolves.toMatchObject({
      shouldApply: true,
      finalDecision: "APPLY",
      score: 50,
      policyAllowed: true,
      reason: "Score 50 meets the configured threshold of 40.",
      diagnostics: expect.objectContaining({
        applicationType: "external",
      }),
    });
  });

  it("keeps linkedin external jobs blocked during easy-apply-batch style evaluation", async () => {
    const deps = createDeps();
    deps.prisma.jobReviewHistory.findFirst.mockResolvedValue(null);
    deps.extractJobText.mockResolvedValue({
      rawText: "raw",
      title: "Control Plane Engineer",
      company: "ClickHouse",
      companyLogoUrl: null,
      companyLinkedinUrl: "https://www.linkedin.com/company/clickhouse/",
      location: "Remote",
      platform: "linkedin",
      applicationType: "external",
    });
    deps.formatJobForLLM.mockReturnValue("prompt");
    deps.parseJob.mockResolvedValue({ parsed: { title: "Control Plane Engineer" } });
    deps.normalizeParsedJob.mockReturnValue({
      title: "Control Plane Engineer",
      company: "ClickHouse",
      location: "Remote",
      remoteType: "remote",
      seniority: "mid",
      mustHaveSkills: ["TypeScript"],
      niceToHaveSkills: [],
      technologies: ["TypeScript", "Node.js"],
      yearsRequired: 4,
      platform: "linkedin",
      applicationType: "external",
      visaSponsorship: "yes",
      workAuthorization: "authorized",
      openQuestionsCount: 0,
    });
    deps.scoreJob.mockReturnValue({ totalScore: 50 });
    deps.evaluatePolicy.mockImplementation((job: any, profile: any, options?: any) =>
      evaluateJobPolicy(job, profile, options),
    );

    const evaluate = createBatchJobEvaluator({
      disableAiEvaluation: false,
      scoreThreshold: 40,
      scoringMode: "local",
      allowExternalLinkedInApply: false,
      scoringProfile: createScoringProfile(),
      evaluationPage: { fake: true } as any,
      deps,
    });

    await expect(evaluate("https://www.linkedin.com/jobs/view/4263540414")).resolves.toMatchObject({
      shouldApply: false,
      finalDecision: "SKIP",
      score: 50,
      policyAllowed: false,
      reason: "Only LinkedIn Easy Apply jobs are allowed in this phase.",
      diagnostics: expect.objectContaining({
        applicationType: "external",
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
      scoringMode: "local",
      scoringProfile: {} as any,
      deps,
    });

    const result = await evaluate("https://example.com/job");

    expect(deps.withPage).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
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
      scoringMode: "local",
      scoringProfile: {
        workplacePolicyBypassLocations: ["Europe"],
      } as any,
      evaluationPage: {} as any,
      deps,
    });

    const result = await evaluate("https://example.com/job");

    expect(result).toMatchObject({
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
      scoringMode: "local",
      scoringProfile: { workplacePolicyBypassLocations: ["Europe"] } as any,
      evaluationPage: {} as any,
      deps,
    });

    const result = await evaluate("https://example.com/job");

    expect(result).toEqual({
      shouldApply: false,
      finalDecision: "SKIP",
      score: 12,
      reason: "Configured workplace-policy bypass matched this job location. Score 12 is below the configured threshold of 60.",
      policyAllowed: true,
      diagnostics: expect.objectContaining({
        title: "Job",
        company: "Acme",
        location: "Berlin, Germany",
        companyLinkedinUrl: null,
        applicationType: "easy_apply",
        companyInfoRead: true,
        metadataRead: true,
      }),
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
      scoringMode: "local",
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

  it("keeps location visible to the LLM when extracted metadata does not contain one", async () => {
    const deps = createDeps();
    deps.prisma.jobReviewHistory.findFirst.mockResolvedValue(null);
    deps.extractJobText.mockResolvedValue({
      rawText: "raw",
      title: "Job",
      company: "Acme",
      companyLogoUrl: null,
      companyLinkedinUrl: null,
      location: null,
      platform: "linkedin",
    });
    deps.formatJobForLLM.mockReturnValue("prompt");
    deps.parseJob.mockResolvedValue({
      parsed: {
        title: "Job",
        company: "Acme",
        location: "Berlin, Germany",
      },
    });
    deps.normalizeParsedJob.mockReturnValue({ platform: "linkedin" });
    deps.scoreJob.mockReturnValue({ totalScore: 80 });
    deps.evaluatePolicy.mockReturnValue({ allowed: true, reasons: [] });

    const evaluate = createBatchJobEvaluator({
      disableAiEvaluation: false,
      scoreThreshold: 60,
      scoringMode: "local",
      scoringProfile: {} as any,
      evaluationPage: {} as any,
      deps,
    });

    await evaluate("https://example.com/job");

    expect(deps.formatJobForLLM).toHaveBeenCalledWith(
      expect.objectContaining({ location: null }),
      { omitLocation: false },
    );
    expect(deps.parseJob).toHaveBeenCalledWith("prompt", {
      excludeLocation: false,
    });
  });

  it("records extracted Istanbul location in diagnostics even if the parse layer guessed Europe", async () => {
    const deps = createDeps();
    deps.prisma.jobReviewHistory.findFirst.mockResolvedValue(null);
    deps.extractJobText.mockResolvedValue({
      rawText: "raw",
      title: "Backend Developer",
      company: "Solid-ICT",
      companyLogoUrl: null,
      companyLinkedinUrl: "https://www.linkedin.com/company/solidict/",
      location: "Istanbul, Türkiye",
      platform: "linkedin",
      applicationType: "easy_apply",
    });
    deps.formatJobForLLM.mockReturnValue("prompt");
    deps.parseJob.mockResolvedValue({
      parsed: {
        title: "Backend Developer",
        company: "Solid-ICT",
        location: null,
        platform: "linkedin",
        seniority: "Senior",
        mustHaveSkills: [],
        niceToHaveSkills: [],
        technologies: [".NET", "Node.js"],
        yearsRequired: 5,
        remoteType: "remote",
        visaSponsorship: null,
        workAuthorization: "authorized",
      },
    });
    deps.normalizeParsedJob.mockReturnValue({
      title: "Backend Developer",
      company: "Solid-ICT",
      location: "Istanbul, Türkiye",
      platform: "linkedin",
      remoteType: "hybrid",
      applicationType: "easy_apply",
    });
    deps.scoreJob.mockReturnValue({ totalScore: 82 });
    deps.evaluatePolicy.mockReturnValue({
      allowed: false,
      reasons: ["Hybrid roles are only allowed in configured locations."],
    });

    const evaluate = createBatchJobEvaluator({
      disableAiEvaluation: false,
      scoreThreshold: 60,
      scoringMode: "local",
      scoringProfile: { workplacePolicyBypassLocations: ["Europe"] } as any,
      evaluationPage: {} as any,
      deps,
    });

    const result = await evaluate("https://www.linkedin.com/jobs/view/4395042318/");

    expect(result).toMatchObject({
      finalDecision: "SKIP",
      policyAllowed: false,
      diagnostics: {
        location: "Istanbul, Türkiye",
        applicationType: "easy_apply",
      },
    });
    expect(deps.prisma.systemLog.create).not.toHaveBeenCalled();
  });
});

