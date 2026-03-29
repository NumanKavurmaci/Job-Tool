import { describe, expect, it, vi } from "vitest";
import { runJobFlow } from "../../../src/app/flows/jobFlow.js";

function createDeps() {
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
    normalizeParsedJob: vi.fn(),
    scoreJob: vi.fn(),
    evaluatePolicy: vi.fn(),
    decideJob: vi.fn(),
    writeRunReport: vi.fn(),
  } as any;
}

describe("job flow", () => {
  it("uses a plain browser session for non-LinkedIn URLs and persists a policy skip without platform", async () => {
    const deps = createDeps();
    const page = { fake: "page" };
    deps.withPage.mockImplementation(async (options: unknown, fn: (page: unknown) => Promise<unknown>) => {
      expect(options).toEqual({});
      return fn(page);
    });
    deps.loadCandidateProfile.mockResolvedValue({ yearsOfExperience: 3 });
    deps.extractJobText.mockResolvedValue({
      rawText: "raw body",
      title: "Title",
      company: "Company",
      companyLogoUrl: "https://cdn.example.com/company.png",
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
        }),
        create: expect.objectContaining({
          companyLogoUrl: "https://cdn.example.com/company.png",
        }),
      }),
    );
    expect(deps.prisma.systemLog.create).toHaveBeenNthCalledWith(1, {
      data: {
        level: "INFO",
        scope: "job.analysis",
        message: "Starting job analysis flow.",
        runType: "decide",
        jobUrl: "https://example.com/job",
      },
    });
    expect(deps.prisma.systemLog.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          level: "INFO",
          scope: "job.analysis",
          message: "Job analysis saved.",
          runType: "decide",
          jobUrl: "https://example.com/job",
        }),
      }),
    );
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
});
