import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadIndexModule() {
  vi.resetModules();
  const module = await import("../../src/index.js");
  const extractJobTextMock = vi.fn();
  const parseJobMock = vi.fn();
  const getConfiguredProviderInfoMock = vi.fn();
  const withPageMock = vi.fn();
  const formatJobForLLMMock = vi.fn();
  const normalizeParsedJobMock = vi.fn();
  const loadCandidateProfileMock = vi.fn();
  const scoreJobMock = vi.fn();
  const evaluatePolicyMock = vi.fn();
  const decideJobMock = vi.fn();
  const upsertMock = vi.fn();
  const createDecisionMock = vi.fn();
  const disconnectMock = vi.fn();
  const infoMock = vi.fn();
  const errorMock = vi.fn();
  const exitMock = vi.fn();

  return {
    module,
    deps: {
      extractJobTextMock,
      parseJobMock,
      getConfiguredProviderInfoMock,
      withPageMock,
      formatJobForLLMMock,
      normalizeParsedJobMock,
      loadCandidateProfileMock,
      scoreJobMock,
      evaluatePolicyMock,
      decideJobMock,
      upsertMock,
      createDecisionMock,
      disconnectMock,
      infoMock,
      errorMock,
      exitMock,
    },
    runtimeDeps: {
      withPage: withPageMock,
      extractJobText: extractJobTextMock,
      formatJobForLLM: formatJobForLLMMock,
      parseJob: parseJobMock,
      getConfiguredProviderInfo: getConfiguredProviderInfoMock,
      normalizeParsedJob: normalizeParsedJobMock,
      loadCandidateProfile: loadCandidateProfileMock,
      scoreJob: scoreJobMock,
      evaluatePolicy: evaluatePolicyMock,
      decideJob: decideJobMock,
      prisma: {
        jobPosting: {
          upsert: upsertMock,
        },
        applicationDecision: {
          create: createDecisionMock,
        },
        $disconnect: disconnectMock,
      },
      logger: {
        info: infoMock,
        error: errorMock,
      },
      exit: exitMock,
    },
  };
}

describe("index entrypoint", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("runs the provider-aware flow and saves the decision", async () => {
    const { module, deps, runtimeDeps } = await loadIndexModule();
    const extracted = {
      rawText: "Raw body",
      title: "Adapter Title",
      company: "Adapter Company",
      location: "Adapter Location",
      platform: "greenhouse",
      applyUrl: "https://apply.example.com",
      currentUrl: "https://jobs.example.com/1",
      descriptionText: "Description",
      requirementsText: "Requirements",
      benefitsText: "Benefits",
    };
    const parsed = {
      title: null,
      company: null,
      location: null,
      platform: null,
      seniority: "Senior",
      mustHaveSkills: ["TypeScript"],
      niceToHaveSkills: [],
      technologies: ["TypeScript"],
      yearsRequired: 5,
      remoteType: "Remote",
      visaSponsorship: "yes",
      workAuthorization: "authorized",
    };
    const normalized = {
      title: "Adapter Title",
      company: "Adapter Company",
      location: "Adapter Location",
      remoteType: "remote",
      seniority: "senior",
      mustHaveSkills: ["TypeScript"],
      niceToHaveSkills: [],
      technologies: ["TypeScript"],
      yearsRequired: 5,
      platform: "greenhouse",
      visaSponsorship: "yes",
      workAuthorization: "authorized",
      openQuestionsCount: 0,
    };

    deps.withPageMock.mockImplementation(async (fn: (page: unknown) => Promise<unknown>) =>
      fn({ fake: "page" }),
    );
    deps.getConfiguredProviderInfoMock.mockReturnValue({
      provider: "local",
      model: "openai/gpt-oss-20b",
    });
    deps.loadCandidateProfileMock.mockResolvedValue({ yearsOfExperience: 3 });
    deps.extractJobTextMock.mockResolvedValue(extracted);
    deps.formatJobForLLMMock.mockReturnValue("Formatted prompt");
    deps.parseJobMock.mockResolvedValue({
      parsed,
      provider: "local",
      model: "openai/gpt-oss-20b",
      rawText: '{"title":"Adapter Title"}',
    });
    deps.normalizeParsedJobMock.mockReturnValue(normalized);
    deps.scoreJobMock.mockReturnValue({
      totalScore: 82,
      breakdown: { skill: 30, seniority: 12, location: 20, tech: 15, bonus: 5 },
    });
    deps.evaluatePolicyMock.mockReturnValue({ allowed: true, reasons: [] });
    deps.decideJobMock.mockReturnValue({ decision: "APPLY", reason: "Strong fit." });
    deps.upsertMock.mockResolvedValue({ id: "job_1" });
    deps.createDecisionMock.mockResolvedValue({ id: "decision_1" });

    const result = await module.main(["https://jobs.example.com/1"], runtimeDeps);

    expect(deps.getConfiguredProviderInfoMock).toHaveBeenCalledTimes(1);
    expect(deps.parseJobMock).toHaveBeenCalledWith("Formatted prompt");
    expect(result.finalDecision).toBe("APPLY");
    expect(result.jobPosting.id).toBe("job_1");
    expect(deps.upsertMock).toHaveBeenCalledWith({
      where: { url: "https://jobs.example.com/1" },
      update: {
        rawText: "Raw body",
        title: "Adapter Title",
        company: "Adapter Company",
        location: "Adapter Location",
        platform: "greenhouse",
        parsedJson: JSON.stringify(parsed),
        normalizedJson: JSON.stringify(normalized),
        parseVersion: "phase-5",
      },
      create: {
        url: "https://jobs.example.com/1",
        rawText: "Raw body",
        title: "Adapter Title",
        company: "Adapter Company",
        location: "Adapter Location",
        platform: "greenhouse",
        parsedJson: JSON.stringify(parsed),
        normalizedJson: JSON.stringify(normalized),
        parseVersion: "phase-5",
      },
    });
    expect(deps.createDecisionMock).toHaveBeenCalledWith({
      data: {
        jobPostingId: "job_1",
        score: 82,
        decision: "APPLY",
        policyAllowed: true,
        reasons: JSON.stringify(["Strong fit."]),
      },
    });
    expect(deps.infoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "local",
        model: "openai/gpt-oss-20b",
      }),
      "Using LLM provider: local (openai/gpt-oss-20b)",
    );
    expect(deps.infoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        parsed,
        normalized,
        provider: "local",
      }),
      "Job parsed and normalized",
    );
    expect(deps.infoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        breakdown: { skill: 30, seniority: 12, location: 20, tech: 15, bonus: 5 },
        totalScore: 82,
      }),
      "Job scored",
    );
    expect(deps.infoMock).toHaveBeenCalled();
  });

  it("throws when no url is provided", async () => {
    const { module, runtimeDeps } = await loadIndexModule();

    await expect(module.main([], runtimeDeps)).rejects.toThrow(
      "Usage: npm run dev -- <job-url> | npm run dev -- score",
    );
  });

  it("logs and prints a clear CLI error message before exiting", async () => {
    const { module, deps, runtimeDeps } = await loadIndexModule();
    const stderrWriteSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    await module.runCli({
      ...runtimeDeps,
      prisma: {
        ...runtimeDeps.prisma,
        $disconnect: deps.disconnectMock,
      },
      getConfiguredProviderInfo: deps.getConfiguredProviderInfoMock,
      logger: runtimeDeps.logger,
      exit: deps.exitMock,
    });

    expect(deps.errorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "cli.failed",
        error: expect.objectContaining({
          message: expect.stringContaining("Usage: npm run dev -- <job-url>"),
        }),
      }),
      "CLI execution failed",
    );
    expect(stderrWriteSpy).toHaveBeenCalledWith(
      expect.stringContaining("Error: Usage: npm run dev -- <job-url>"),
    );
    expect(deps.exitMock).toHaveBeenCalledWith(1);
    stderrWriteSpy.mockRestore();
  });

  it("wraps database save failures with a database phase error", async () => {
    const { module, deps, runtimeDeps } = await loadIndexModule();
    deps.withPageMock.mockImplementation(async (fn: (page: unknown) => Promise<unknown>) =>
      fn({ fake: "page" }),
    );
    deps.getConfiguredProviderInfoMock.mockReturnValue({
      provider: "local",
      model: "openai/gpt-oss-20b",
    });
    deps.loadCandidateProfileMock.mockResolvedValue({ yearsOfExperience: 3 });
    deps.extractJobTextMock.mockResolvedValue({
      rawText: "Raw body",
      title: "Adapter Title",
      company: "Adapter Company",
      location: "Adapter Location",
      platform: "greenhouse",
    });
    deps.formatJobForLLMMock.mockReturnValue("Formatted prompt");
    deps.parseJobMock.mockResolvedValue({
      parsed: {
        title: "Adapter Title",
        company: "Adapter Company",
        location: "Adapter Location",
        platform: "greenhouse",
        seniority: "Senior",
        mustHaveSkills: [],
        niceToHaveSkills: [],
        technologies: [],
        yearsRequired: null,
        remoteType: null,
        visaSponsorship: null,
        workAuthorization: null,
      },
      provider: "local",
      model: "openai/gpt-oss-20b",
      rawText: "{}",
    });
    deps.normalizeParsedJobMock.mockReturnValue({
      title: "Adapter Title",
      company: "Adapter Company",
      location: "Adapter Location",
      remoteType: "unknown",
      seniority: "senior",
      mustHaveSkills: [],
      niceToHaveSkills: [],
      technologies: [],
      yearsRequired: null,
      platform: "greenhouse",
      visaSponsorship: null,
      workAuthorization: null,
      openQuestionsCount: 0,
    });
    deps.scoreJobMock.mockReturnValue({
      totalScore: 50,
      breakdown: { skill: 10, seniority: 10, location: 10, tech: 10, bonus: 10 },
    });
    deps.evaluatePolicyMock.mockReturnValue({ allowed: true, reasons: [] });
    deps.decideJobMock.mockReturnValue({ decision: "MAYBE", reason: "Borderline fit." });
    deps.upsertMock.mockRejectedValue(new Error("sqlite busy"));

    await expect(module.main(["https://jobs.example.com/1"], runtimeDeps)).rejects.toMatchObject({
      name: "AppError",
      phase: "database",
      code: "DATABASE_WRITE_FAILED",
      message: "Failed to save job analysis to the database.",
    });
  });
});
