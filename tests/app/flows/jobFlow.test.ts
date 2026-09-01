import { describe, expect, it, vi } from "vitest";
import { runJobFlow } from "../../../src/app/flows/jobFlow.js";

function createDeps() {
  const scoreJob = vi.fn();
  const scoreJobWithAi = vi.fn().mockImplementation(async (...args) => scoreJob(...args));

  return {
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    prisma: {
      firm: {
        upsert: vi.fn().mockResolvedValue({ id: "firm_1", name: "Company" }),
        update: vi.fn().mockResolvedValue({ id: "firm_1", name: "Company" }),
      },
      jobPosting: { upsert: vi.fn(), count: vi.fn().mockResolvedValue(0) },
      applicationDecision: { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
      systemLog: { create: vi.fn().mockResolvedValue({}) },
      jobReviewHistory: { create: vi.fn().mockResolvedValue({}) },
    },
    loadCandidateProfile: vi.fn(),
    withPage: vi.fn(),
    extractJobText: vi.fn(),
    formatJobForLLM: vi.fn(),
    parseJob: vi.fn(),
    completePrompt: vi.fn(),
    normalizeParsedJob: vi.fn(),
    scoreJob,
    scoreJobWithAi,
    evaluatePolicy: vi.fn(),
    decideJob: vi.fn(),
    writeRunReport: vi.fn(),
  } as any;
}

describe("job flow", () => {
  it("blocks browser extraction and AI for a previously reviewed job", async () => {
    const deps = createDeps();
    deps.prisma.jobReviewHistory.findFirst = vi.fn().mockResolvedValue({
      id: "review_1",
      createdAt: new Date("2026-09-01T10:00:00.000Z"),
      status: "SKIPPED",
      decision: "SKIP",
      score: 48,
      policyAllowed: true,
    });
    deps.writeRunReport.mockResolvedValue(
      "artifacts/job-runs/decide-already-reviewed.json",
    );

    const result = await runJobFlow(
      "decide",
      "https://example.com/job",
      deps,
    );

    expect(result).toMatchObject({
      mode: "decide",
      alreadyReviewed: true,
      scoreSkipped: true,
      finalDecision: "SKIP",
      reportPath: "artifacts/job-runs/decide-already-reviewed.json",
    });
    expect(deps.withPage).not.toHaveBeenCalled();
    expect(deps.extractJobText).not.toHaveBeenCalled();
    expect(deps.loadCandidateProfile).not.toHaveBeenCalled();
    expect(deps.parseJob).not.toHaveBeenCalled();
    expect(deps.scoreJob).not.toHaveBeenCalled();
    expect(deps.scoreJobWithAi).not.toHaveBeenCalled();
  });

  it("blocks browser extraction and AI when only a persisted decision exists", async () => {
    const deps = createDeps();
    deps.prisma.jobReviewHistory.findFirst = vi.fn().mockResolvedValue(null);
    deps.prisma.jobPosting.findUnique = vi.fn().mockResolvedValue({
      id: "job_legacy",
      url: "https://example.com/job",
      platform: "greenhouse",
      decisions: [
        {
          id: "decision_legacy",
          score: 52,
          decision: "SKIP",
          policyAllowed: true,
          reasons: JSON.stringify(["Previously reviewed."]),
          createdAt: new Date("2026-08-31T10:00:00.000Z"),
        },
      ],
    });
    deps.writeRunReport.mockResolvedValue(
      "artifacts/job-runs/score-already-reviewed.json",
    );

    const result = await runJobFlow(
      "score",
      "https://example.com/job",
      deps,
    );

    expect(result).toMatchObject({
      alreadyReviewed: true,
      scoreSkipped: true,
      finalDecision: "SKIP",
      previousReview: {
        score: 52,
        decision: "SKIP",
      },
    });
    expect(deps.withPage).not.toHaveBeenCalled();
    expect(deps.parseJob).not.toHaveBeenCalled();
    expect(deps.scoreJob).not.toHaveBeenCalled();
    expect(deps.scoreJobWithAi).not.toHaveBeenCalled();
  });

  it("fails closed before AI when review history cannot be verified", async () => {
    const deps = createDeps();
    deps.prisma.jobReviewHistory.findFirst = vi
      .fn()
      .mockRejectedValue(new Error("db down"));
    deps.writeRunReport.mockResolvedValue(
      "artifacts/job-runs/decide-history-check-failed.json",
    );

    const result = await runJobFlow(
      "decide",
      "https://example.com/job",
      deps,
    );

    expect(result).toMatchObject({
      historyCheckFailed: true,
      scoreSkipped: true,
      finalDecision: "SKIP",
    });
    expect(deps.withPage).not.toHaveBeenCalled();
    expect(deps.parseJob).not.toHaveBeenCalled();
    expect(deps.scoreJobWithAi).not.toHaveBeenCalled();
  });

  it("uses a plain browser session for non-LinkedIn URLs and persists a policy skip without platform", async () => {
    const deps = createDeps();
    const page = { fake: "page" };
    deps.withPage.mockImplementation(async (options: unknown, fn: (page: unknown) => Promise<unknown>) => {
      expect(options).toEqual({});
      return fn(page);
    });
    deps.loadCandidateProfile.mockResolvedValue({
      yearsOfExperience: 3,
      workplacePolicyBypassLocations: ["Europe"],
    });
    deps.extractJobText.mockResolvedValue({
      rawText: "raw body",
      title: "Title",
      company: "Company",
      companyLogoUrl: "https://cdn.example.com/company.png",
      companyLinkedinUrl: "https://www.linkedin.com/company/company/",
      location: "Istanbul",
      platform: "greenhouse",
    });
    deps.formatJobForLLM.mockReturnValue("prompt");
    deps.parseJob.mockResolvedValue({
      parsed: {
        title: null,
        company: null,
        location: null,
        platform: null,
      },
      provider: "local",
      model: "test-model",
    });
    deps.normalizeParsedJob.mockReturnValue({});
    deps.scoreJob.mockReturnValue({
      totalScore: 88,
      breakdown: { skill: 20, seniority: 20, location: 20, tech: 20, bonus: 8 },
    });
    deps.evaluatePolicy.mockReturnValue({
      allowed: false,
      reasons: ["On-site roles are blocked."],
    });
    deps.decideJob.mockReturnValue({
      decision: "APPLY",
      reason: "Strong fit.",
    });
    deps.prisma.jobPosting.upsert.mockResolvedValue({ id: "job_1" });
    deps.prisma.applicationDecision.create.mockResolvedValue({ id: "decision_1" });
    deps.writeRunReport.mockResolvedValue("artifacts/job-runs/decide.json");

    const result = await runJobFlow("decide", "https://example.com/job", deps);

    expect(result.finalDecision).toBe("SKIP");
    expect(deps.extractJobText).toHaveBeenCalledWith(page, "https://example.com/job");
    expect(deps.formatJobForLLM).toHaveBeenCalledWith(
      expect.objectContaining({ location: "Istanbul" }),
      { omitLocation: true },
    );
    expect(deps.parseJob).toHaveBeenCalledWith("prompt", {
      excludeLocation: true,
    });
    expect(deps.prisma.jobReviewHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobPostingId: "job_1",
        jobUrl: "https://example.com/job",
        status: "SKIPPED",
        reasons: JSON.stringify(["On-site roles are blocked."]),
      }),
    });
    expect(deps.prisma.jobPosting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          companyLogoUrl: "https://cdn.example.com/company.png",
          companyLinkedinUrl: "https://www.linkedin.com/company/company/",
        }),
        create: expect.objectContaining({
          companyLogoUrl: "https://cdn.example.com/company.png",
          companyLinkedinUrl: "https://www.linkedin.com/company/company/",
        }),
      }),
    );
    expect(deps.prisma.systemLog.create).not.toHaveBeenCalled();
  });

  it("uses the LinkedIn browser session options for LinkedIn URLs", async () => {
    const deps = createDeps();
    const page = { fake: "page" };
    deps.withPage.mockImplementation(async (_options: unknown, fn: (page: unknown) => Promise<unknown>) => fn(page));
    deps.loadCandidateProfile.mockResolvedValue({ yearsOfExperience: 3 });
    deps.extractJobText.mockResolvedValue({
      rawText: "raw body",
      title: "Title",
      company: "Company",
      companyLogoUrl: null,
      companyLinkedinUrl: null,
      location: "Remote",
      platform: "linkedin",
    });
    deps.formatJobForLLM.mockReturnValue("prompt");
    deps.parseJob.mockResolvedValue({
      parsed: {
        title: "Title",
        company: "Company",
        location: "Remote",
        platform: "linkedin",
      },
      provider: "local",
      model: "test-model",
    });
    deps.normalizeParsedJob.mockReturnValue({ platform: "linkedin" });
    deps.scoreJob.mockReturnValue({
      totalScore: 70,
      breakdown: { skill: 20, seniority: 20, location: 20, tech: 5, bonus: 5 },
    });
    deps.evaluatePolicy.mockReturnValue({ allowed: true, reasons: [] });
    deps.decideJob.mockReturnValue({ decision: "APPLY", reason: "Good fit." });
    deps.prisma.jobPosting.upsert.mockResolvedValue({ id: "job_1" });
    deps.prisma.applicationDecision.create.mockResolvedValue({ id: "decision_1" });
    deps.writeRunReport.mockResolvedValue("artifacts/job-runs/decide.json");

    await runJobFlow("score", "https://www.linkedin.com/jobs/view/1", deps);

    expect(deps.withPage).toHaveBeenCalledWith(
      expect.objectContaining({
        storageStatePath: expect.any(String),
        persistStorageState: true,
      }),
      expect.any(Function),
    );
  });

  it("skips candidate loading, parsing and scoring for an already-applied Kariyer job", async () => {
    const deps = createDeps();
    const page = { fake: "page" };
    deps.withPage.mockImplementation(async (_options: unknown, fn: (page: unknown) => Promise<unknown>) => fn(page));
    deps.extractJobText.mockResolvedValue({
      rawText: "Candidate Application Status: already_applied",
      title: "Backend Developer",
      company: "Acme",
      companyLogoUrl: null,
      companyLinkedinUrl: null,
      location: "Ankara",
      platform: "kariyer",
      applicationType: "unknown",
      applicationStatus: "open",
      alreadyApplied: true,
      applyUrl: null,
      currentUrl: "https://www.kariyer.net/is-ilani/acme-backend-developer-4599999",
      descriptionText: "Backend role",
      requirementsText: null,
      benefitsText: null,
    });
    deps.writeRunReport.mockResolvedValue("artifacts/job-runs/score-already-applied.json");

    const result = await runJobFlow(
      "score",
      "https://www.kariyer.net/is-ilani/acme-backend-developer-4599999",
      deps,
    );

    expect(result).toMatchObject({
      mode: "score",
      alreadyApplied: true,
      scoreSkipped: true,
      finalDecision: "SKIP",
      reportPath: "artifacts/job-runs/score-already-applied.json",
    });
    expect(deps.withPage).toHaveBeenCalledWith(
      expect.objectContaining({
        persistentProfilePath: expect.any(String),
        storageStatePath: expect.any(String),
        persistStorageState: true,
      }),
      expect.any(Function),
    );
    expect(deps.loadCandidateProfile).not.toHaveBeenCalled();
    expect(deps.formatJobForLLM).not.toHaveBeenCalled();
    expect(deps.parseJob).not.toHaveBeenCalled();
    expect(deps.scoreJob).not.toHaveBeenCalled();
    expect(deps.scoreJobWithAi).not.toHaveBeenCalled();
    expect(deps.evaluatePolicy).not.toHaveBeenCalled();
    expect(deps.decideJob).not.toHaveBeenCalled();
    expect(deps.prisma.jobPosting.upsert).not.toHaveBeenCalled();
    expect(deps.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ platform: "kariyer" }),
      "Skipping score evaluation for already-applied job",
    );
  });

  it("does not force APPLY for Europe-centered jobs when the score decision skips", async () => {
    const deps = createDeps();
    const page = { fake: "page" };
    deps.withPage.mockImplementation(async (_options: unknown, fn: (page: unknown) => Promise<unknown>) => fn(page));
    deps.loadCandidateProfile.mockResolvedValue({
      yearsOfExperience: 3,
      workplacePolicyBypassLocations: ["Europe"],
    });
    deps.extractJobText.mockResolvedValue({
      rawText: "raw body",
      title: "Title",
      company: "Company",
      companyLogoUrl: null,
      companyLinkedinUrl: null,
      location: "Berlin, Germany",
      platform: "linkedin",
      applicationType: "easy_apply",
    });
    deps.formatJobForLLM.mockReturnValue("prompt");
    deps.parseJob.mockResolvedValue({
      parsed: {
        title: "Title",
        company: "Company",
        location: "Berlin, Germany",
        platform: "linkedin",
      },
      provider: "local",
      model: "test-model",
    });
    deps.normalizeParsedJob.mockReturnValue({
      title: "Title",
      company: "Company",
      location: "Berlin, Germany",
      remoteType: "onsite",
      platform: "linkedin",
      applicationType: "easy_apply",
    });
    deps.scoreJob.mockReturnValue({
      totalScore: 5,
      breakdown: { skill: 1, seniority: 1, location: 0, tech: 1, bonus: 2 },
    });
    deps.evaluatePolicy.mockReturnValue({ allowed: true, reasons: [] });
    deps.decideJob.mockReturnValue({ decision: "SKIP", reason: "Weak fit." });
    deps.prisma.jobPosting.upsert.mockResolvedValue({ id: "job_1" });
    deps.prisma.applicationDecision.create.mockResolvedValue({ id: "decision_1" });
    deps.writeRunReport.mockResolvedValue("artifacts/job-runs/decide.json");

    const result = await runJobFlow("decide", "https://www.linkedin.com/jobs/view/1", deps);

    expect(result.finalDecision).toBe("SKIP");
    expect(result.finalReasons).toEqual([
      "Configured workplace-policy bypass matched this job location. Weak fit.",
    ]);
  });

  it("keeps location in the LLM prompt when extracted metadata does not contain one", async () => {
    const deps = createDeps();
    const page = { fake: "page" };
    deps.withPage.mockImplementation(async (_options: unknown, fn: (page: unknown) => Promise<unknown>) => fn(page));
    deps.loadCandidateProfile.mockResolvedValue({ yearsOfExperience: 3 });
    deps.extractJobText.mockResolvedValue({
      rawText: "raw body",
      title: "Title",
      company: "Company",
      companyLogoUrl: null,
      companyLinkedinUrl: null,
      location: null,
      platform: "linkedin",
    });
    deps.formatJobForLLM.mockReturnValue("prompt");
    deps.parseJob.mockResolvedValue({
      parsed: {
        title: "Title",
        company: "Company",
        location: "Berlin, Germany",
        platform: "linkedin",
      },
      provider: "local",
      model: "test-model",
    });
    deps.normalizeParsedJob.mockReturnValue({ platform: "linkedin" });
    deps.scoreJob.mockReturnValue({
      totalScore: 70,
      breakdown: { skill: 20, seniority: 20, location: 20, tech: 5, bonus: 5 },
    });
    deps.evaluatePolicy.mockReturnValue({ allowed: true, reasons: [] });
    deps.decideJob.mockReturnValue({ decision: "APPLY", reason: "Good fit." });
    deps.prisma.jobPosting.upsert.mockResolvedValue({ id: "job_1" });
    deps.prisma.applicationDecision.create.mockResolvedValue({ id: "decision_1" });
    deps.writeRunReport.mockResolvedValue("artifacts/job-runs/decide.json");

    await runJobFlow("decide", "https://www.linkedin.com/jobs/view/1", deps);

    expect(deps.formatJobForLLM).toHaveBeenCalledWith(
      expect.objectContaining({ location: null }),
      { omitLocation: false },
    );
    expect(deps.parseJob).toHaveBeenCalledWith("prompt", {
      excludeLocation: false,
    });
  });

  it("blocks the Solid-ICT Istanbul case even if the parse layer would have guessed Europe", async () => {
    const deps = createDeps();
    const page = { fake: "page" };
    deps.withPage.mockImplementation(async (_options: unknown, fn: (page: unknown) => Promise<unknown>) => fn(page));
    deps.loadCandidateProfile.mockResolvedValue({
      yearsOfExperience: 5,
      workplacePolicyBypassLocations: ["Europe"],
    });
    deps.extractJobText.mockResolvedValue({
      rawText: "raw body",
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
      },
      provider: "local",
      model: "test-model",
    });
    deps.normalizeParsedJob.mockReturnValue({
      title: "Backend Developer",
      company: "Solid-ICT",
      location: "Istanbul, Türkiye",
      platform: "linkedin",
      remoteType: "hybrid",
      applicationType: "easy_apply",
    });
    deps.scoreJob.mockReturnValue({
      totalScore: 21,
      breakdown: { skill: 6, seniority: 5, location: 0, tech: 5, bonus: 5 },
    });
    deps.evaluatePolicy.mockReturnValue({
      allowed: false,
      reasons: ["Hybrid roles are only allowed in configured locations."],
    });
    deps.decideJob.mockReturnValue({ decision: "APPLY", reason: "Score override." });
    deps.prisma.jobPosting.upsert.mockResolvedValue({ id: "job_1" });
    deps.prisma.applicationDecision.create.mockResolvedValue({ id: "decision_1" });
    deps.writeRunReport.mockResolvedValue("artifacts/job-runs/decide.json");

    const result = await runJobFlow(
      "decide",
      "https://www.linkedin.com/jobs/view/4395042318/",
      deps,
    );

    expect(result.finalDecision).toBe("SKIP");
    expect(result.finalReasons).toEqual([
      "Hybrid roles are only allowed in configured locations.",
    ]);
    expect(deps.formatJobForLLM).toHaveBeenCalledWith(
      expect.objectContaining({ location: "Istanbul, Türkiye" }),
      { omitLocation: true },
    );
    expect(deps.parseJob).toHaveBeenCalledWith("prompt", {
      excludeLocation: true,
    });
  });
});
