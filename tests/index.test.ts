import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadIndexModule() {
  vi.resetModules();
  const module = await import("../../src/index.js");
  const extractJobTextMock = vi.fn();
  const parseJobWithLLMMock = vi.fn();
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
      parseJobWithLLMMock,
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
      parseJobWithLLM: parseJobWithLLMMock,
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

  it("runs the full phase 3 flow and saves the decision", async () => {
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
    const profile = { yearsOfExperience: 3 };
    const score = {
      totalScore: 82,
      breakdown: {
        skill: 30,
        seniority: 12,
        location: 20,
        tech: 15,
        bonus: 5,
      },
    };
    const policy = { allowed: true, reasons: [] };
    const decision = { decision: "APPLY", reason: "Strong fit." };
    const savedJob = { id: "job_1" };
    const savedDecision = { id: "decision_1" };

    deps.withPageMock.mockImplementation(async (fn: (page: unknown) => Promise<unknown>) =>
      fn({ fake: "page" }),
    );
    deps.loadCandidateProfileMock.mockResolvedValue(profile);
    deps.extractJobTextMock.mockResolvedValue(extracted);
    deps.formatJobForLLMMock.mockReturnValue("Formatted prompt");
    deps.parseJobWithLLMMock.mockResolvedValue(parsed);
    deps.normalizeParsedJobMock.mockReturnValue(normalized);
    deps.scoreJobMock.mockReturnValue(score);
    deps.evaluatePolicyMock.mockReturnValue(policy);
    deps.decideJobMock.mockReturnValue(decision);
    deps.upsertMock.mockResolvedValue(savedJob);
    deps.createDecisionMock.mockResolvedValue(savedDecision);

    const result = await module.main(["https://jobs.example.com/1"], runtimeDeps);

    expect(deps.loadCandidateProfileMock).toHaveBeenCalledTimes(1);
    expect(deps.extractJobTextMock).toHaveBeenCalledWith(
      { fake: "page" },
      "https://jobs.example.com/1",
    );
    expect(deps.normalizeParsedJobMock).toHaveBeenCalledWith(parsed, extracted);
    expect(deps.scoreJobMock).toHaveBeenCalledWith(normalized, profile);
    expect(deps.evaluatePolicyMock).toHaveBeenCalledWith(normalized, profile);
    expect(deps.decideJobMock).toHaveBeenCalledWith(score);
    expect(deps.upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { url: "https://jobs.example.com/1" },
        update: expect.objectContaining({
          normalizedJson: JSON.stringify(normalized),
          parseVersion: "phase-3",
        }),
      }),
    );
    expect(deps.createDecisionMock).toHaveBeenCalledWith({
      data: {
        jobPostingId: "job_1",
        score: 82,
        decision: "APPLY",
        policyAllowed: true,
        reasons: JSON.stringify(["Strong fit."]),
      },
    });
    expect(result.jobPosting).toBe(savedJob);
    expect(result.applicationDecision).toBe(savedDecision);
    expect(result.finalDecision).toBe("APPLY");
  });

  it("throws when no url is provided", async () => {
    const { module, runtimeDeps } = await loadIndexModule();

    await expect(module.main([], runtimeDeps)).rejects.toThrow(
      "Usage: npm run dev -- <job-url> | npm run dev -- score",
    );
  });

  it("disconnects after successful CLI execution", async () => {
    const { module, deps, runtimeDeps } = await loadIndexModule();
    deps.withPageMock.mockImplementation(async (fn: (page: unknown) => Promise<unknown>) =>
      fn({ fake: "page" }),
    );
    deps.loadCandidateProfileMock.mockResolvedValue({ yearsOfExperience: 3 });
    deps.extractJobTextMock.mockResolvedValue({
      rawText: "Raw body",
      title: null,
      company: null,
      location: null,
      platform: "generic",
      applyUrl: null,
      currentUrl: "https://jobs.example.com/1",
      descriptionText: null,
      requirementsText: null,
      benefitsText: null,
    });
    deps.formatJobForLLMMock.mockReturnValue("Formatted prompt");
    deps.parseJobWithLLMMock.mockResolvedValue({
      title: null,
      company: null,
      location: null,
      platform: null,
      seniority: null,
      mustHaveSkills: [],
      niceToHaveSkills: [],
      technologies: [],
      yearsRequired: null,
      remoteType: null,
      visaSponsorship: null,
      workAuthorization: null,
    });
    deps.normalizeParsedJobMock.mockReturnValue({
      title: null,
      company: null,
      location: null,
      remoteType: "unknown",
      seniority: "unknown",
      mustHaveSkills: [],
      niceToHaveSkills: [],
      technologies: [],
      yearsRequired: null,
      platform: "generic",
      visaSponsorship: "unknown",
      workAuthorization: "authorized",
      openQuestionsCount: 0,
    });
    deps.scoreJobMock.mockReturnValue({
      totalScore: 50,
      breakdown: { skill: 0, seniority: 8, location: 8, tech: 0, bonus: 0 },
    });
    deps.evaluatePolicyMock.mockReturnValue({ allowed: true, reasons: [] });
    deps.decideJobMock.mockReturnValue({ decision: "MAYBE", reason: "Needs review." });
    deps.upsertMock.mockResolvedValue({ id: "job_2" });
    deps.createDecisionMock.mockResolvedValue({ id: "decision_2" });

    const originalArgv = process.argv;
    process.argv = ["node", "src/index.ts", "https://jobs.example.com/1"];

    await module.runCli(runtimeDeps);

    expect(deps.disconnectMock).toHaveBeenCalledTimes(1);
    expect(deps.exitMock).not.toHaveBeenCalled();
    process.argv = originalArgv;
  });

  it("logs errors, exits, and disconnects on failure", async () => {
    const { module, deps, runtimeDeps } = await loadIndexModule();
    deps.loadCandidateProfileMock.mockResolvedValue({ yearsOfExperience: 3 });
    deps.withPageMock.mockRejectedValue(new Error("fetch failed"));
    deps.exitMock.mockImplementation(() => {
      throw new Error("exit:1");
    });

    await expect(module.runCli(runtimeDeps)).rejects.toThrow("exit:1");
    expect(deps.errorMock).toHaveBeenCalledTimes(1);
    expect(deps.disconnectMock).toHaveBeenCalledTimes(1);
  });

  it("parses score and decide CLI forms", async () => {
    const { module } = await loadIndexModule();

    expect(module.parseCliArgs(["score", "https://jobs.example.com/1"])).toEqual({
      mode: "score",
      url: "https://jobs.example.com/1",
    });
    expect(module.parseCliArgs(["decide", "https://jobs.example.com/1"])).toEqual({
      mode: "decide",
      url: "https://jobs.example.com/1",
    });
  });

  it("forces final skip when policy blocks the job", async () => {
    const { module, deps, runtimeDeps } = await loadIndexModule();
    deps.withPageMock.mockImplementation(async (fn: (page: unknown) => Promise<unknown>) =>
      fn({ fake: "page" }),
    );
    deps.loadCandidateProfileMock.mockResolvedValue({ yearsOfExperience: 3 });
    deps.extractJobTextMock.mockResolvedValue({
      rawText: "Raw body",
      title: "Senior Engineer",
      company: "Acme",
      location: "Istanbul",
      platform: "generic",
      applyUrl: null,
      currentUrl: "https://jobs.example.com/blocked",
      descriptionText: "Description",
      requirementsText: "Requirements",
      benefitsText: null,
    });
    deps.formatJobForLLMMock.mockReturnValue("Formatted prompt");
    deps.parseJobWithLLMMock.mockResolvedValue({
      title: "Senior Engineer",
      company: "Acme",
      location: "Istanbul",
      platform: "generic",
      seniority: "Senior",
      mustHaveSkills: [],
      niceToHaveSkills: [],
      technologies: [],
      yearsRequired: 5,
      remoteType: "onsite",
      visaSponsorship: "yes",
      workAuthorization: "authorized",
    });
    deps.normalizeParsedJobMock.mockReturnValue({
      title: "Senior Engineer",
      company: "Acme",
      location: "Istanbul",
      remoteType: "onsite",
      seniority: "senior",
      mustHaveSkills: [],
      niceToHaveSkills: [],
      technologies: [],
      yearsRequired: 5,
      platform: "generic",
      visaSponsorship: "yes",
      workAuthorization: "authorized",
      openQuestionsCount: 0,
    });
    deps.scoreJobMock.mockReturnValue({
      totalScore: 88,
      breakdown: { skill: 30, seniority: 18, location: 20, tech: 10, bonus: 10 },
    });
    deps.evaluatePolicyMock.mockReturnValue({
      allowed: false,
      reasons: ["Istanbul onsite roles are blocked by policy."],
    });
    deps.decideJobMock.mockReturnValue({
      decision: "APPLY",
      reason: "Would apply by score.",
    });
    deps.upsertMock.mockResolvedValue({ id: "job_3" });
    deps.createDecisionMock.mockResolvedValue({ id: "decision_3" });

    const result = await module.main(["decide", "https://jobs.example.com/blocked"], runtimeDeps);

    expect(deps.createDecisionMock).toHaveBeenCalledWith({
      data: {
        jobPostingId: "job_3",
        score: 88,
        decision: "SKIP",
        policyAllowed: false,
        reasons: JSON.stringify(["Istanbul onsite roles are blocked by policy."]),
      },
    });
    expect(result.finalDecision).toBe("SKIP");
  });
});
