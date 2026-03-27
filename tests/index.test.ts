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
    expect(deps.infoMock).toHaveBeenCalled();
  });

  it("throws when no url is provided", async () => {
    const { module, runtimeDeps } = await loadIndexModule();

    await expect(module.main([], runtimeDeps)).rejects.toThrow(
      "Usage: npm run dev -- <job-url> | npm run dev -- score",
    );
  });
});
