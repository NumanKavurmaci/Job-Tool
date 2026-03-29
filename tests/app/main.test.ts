import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadIndexModule(readFileMock?: ReturnType<typeof vi.fn>) {
  vi.resetModules();

  if (readFileMock) {
    vi.doMock("node:fs/promises", () => ({
      readFile: readFileMock,
    }));
  }

    const module = await import("../../src/app/main.js");
  const getConfiguredProviderInfoMock = vi.fn(() => ({
    provider: "local",
    model: "openai/gpt-oss-20b",
  }));
  const loadCandidateMasterProfileMock = vi.fn();
  const loadCandidateProfileMock = vi.fn();
  const resolveAnswerMock = vi.fn();
  const withPageMock = vi.fn();
  const extractJobTextMock = vi.fn();
  const formatJobForLLMMock = vi.fn();
  const parseJobMock = vi.fn();
  const normalizeParsedJobMock = vi.fn();
  const scoreJobMock = vi.fn();
  const evaluatePolicyMock = vi.fn();
  const decideJobMock = vi.fn();
  const runEasyApplyMock = vi.fn();
  const runEasyApplyBatchMock = vi.fn();
  const runEasyApplyDryRunMock = vi.fn();
  const runEasyApplyBatchDryRunMock = vi.fn();
  const createEasyApplyDriverMock = vi.fn();
  const createSnapshotMock = vi.fn();
  const createPreparedAnswerSetMock = vi.fn();
  const createSystemLogMock = vi.fn();
  const createJobReviewHistoryMock = vi.fn();
  const findFirstJobReviewHistoryMock = vi.fn();
  const firmUpsertMock = vi.fn().mockResolvedValue({ id: "firm_1", name: "Adapter Company" });
  const firmUpdateMock = vi.fn().mockResolvedValue({ id: "firm_1", name: "Adapter Company" });
  const jobPostingCountMock = vi.fn().mockResolvedValue(0);
  const findDecisionMock = vi.fn().mockResolvedValue([]);
  const writeRunReportMock = vi.fn().mockResolvedValue("artifacts/batch-runs/report.json");
  const upsertMock = vi.fn().mockResolvedValue({ id: "job_1", company: "Adapter Company" });
  const createDecisionMock = vi.fn().mockResolvedValue({ id: "decision_1" });
  const disconnectMock = vi.fn();
  const infoMock = vi.fn();
  const warnMock = vi.fn();
  const errorMock = vi.fn();
  const exitMock = vi.fn();

  return {
    module,
    mocks: {
      getConfiguredProviderInfoMock,
      loadCandidateMasterProfileMock,
      loadCandidateProfileMock,
      resolveAnswerMock,
      withPageMock,
      extractJobTextMock,
      formatJobForLLMMock,
      parseJobMock,
      normalizeParsedJobMock,
      scoreJobMock,
      evaluatePolicyMock,
      decideJobMock,
      runEasyApplyMock,
      runEasyApplyBatchMock,
      runEasyApplyDryRunMock,
      runEasyApplyBatchDryRunMock,
      createEasyApplyDriverMock,
      createSnapshotMock,
      createPreparedAnswerSetMock,
      createSystemLogMock,
      createJobReviewHistoryMock,
      findFirstJobReviewHistoryMock,
      firmUpsertMock,
      firmUpdateMock,
      jobPostingCountMock,
      findDecisionMock,
      writeRunReportMock,
      upsertMock,
      createDecisionMock,
      disconnectMock,
      infoMock,
      warnMock,
      errorMock,
      exitMock,
    },
    deps: {
      getConfiguredProviderInfo: getConfiguredProviderInfoMock,
      loadCandidateMasterProfile: loadCandidateMasterProfileMock,
      loadCandidateProfile: loadCandidateProfileMock,
      resolveAnswer: resolveAnswerMock,
      withPage: withPageMock,
      extractJobText: extractJobTextMock,
      formatJobForLLM: formatJobForLLMMock,
      parseJob: parseJobMock,
      normalizeParsedJob: normalizeParsedJobMock,
      scoreJob: scoreJobMock,
      evaluatePolicy: evaluatePolicyMock,
      decideJob: decideJobMock,
      runEasyApply: runEasyApplyMock,
      runEasyApplyBatch: runEasyApplyBatchMock,
      runEasyApplyDryRun: runEasyApplyDryRunMock,
      runEasyApplyBatchDryRun: runEasyApplyBatchDryRunMock,
      createEasyApplyDriver: createEasyApplyDriverMock,
      writeRunReport: writeRunReportMock,
      prisma: {
        firm: {
          upsert: firmUpsertMock,
          update: firmUpdateMock,
        },
        jobPosting: { upsert: upsertMock, count: jobPostingCountMock },
        applicationDecision: { create: createDecisionMock, findMany: findDecisionMock },
        candidateProfileSnapshot: { create: createSnapshotMock },
        preparedAnswerSet: { create: createPreparedAnswerSetMock },
        systemLog: { create: createSystemLogMock },
        jobReviewHistory: {
          create: createJobReviewHistoryMock,
          findFirst: findFirstJobReviewHistoryMock,
        },
        $disconnect: disconnectMock,
      },
      logger: {
        info: infoMock,
        warn: warnMock,
        error: errorMock,
      },
      exit: exitMock,
    },
  };
}

function mockWithPageSuccess(mock: ReturnType<typeof vi.fn>) {
  const evaluationPage = {
    fake: "evaluation-page",
    close: vi.fn().mockResolvedValue(undefined),
  };
  const newEvaluationPageMock = vi.fn().mockResolvedValue(evaluationPage);
  const context = {
    newPage: newEvaluationPageMock,
  };
  const page = {
    fake: "page",
    context: () => context,
  };

  mock.mockImplementation(
    async (
      optionsOrFn: unknown,
      maybeFn?: (page: unknown) => Promise<unknown>,
    ) => {
      const fn = typeof optionsOrFn === "function" ? optionsOrFn : maybeFn;
      return fn?.(page);
    },
  );

  return {
    page,
    evaluationPage,
    newEvaluationPageMock,
  };
}

describe("phase 5 index flows", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("builds and saves a candidate profile snapshot", async () => {
    const { module, mocks, deps } = await loadIndexModule();
    mocks.loadCandidateMasterProfileMock.mockResolvedValue({
      fullName: "Jane Doe",
      linkedinUrl: "https://linkedin.com/in/jane",
      sourceMetadata: { resumePath: "./resume.txt" },
    });
    mocks.loadCandidateProfileMock.mockResolvedValue({
      yearsOfExperience: 3,
      preferredRoles: [],
      preferredTechStack: [],
      excludedRoles: [],
      preferredLocations: [],
      excludedLocations: [],
      remotePreference: "remote",
      remoteOnly: true,
      visaRequirement: "not-required",
      languages: [],
      salaryExpectation: null,
      salaryExpectations: { usd: null, eur: null, try: null },
      gpa: null,
      linkedinUrl: null,
      workAuthorizationStatus: "authorized",
      requiresSponsorship: false,
      willingToRelocate: false,
      disability: {
        hasVisualDisability: false,
        disabilityPercentage: null,
        requiresAccommodation: null,
        accommodationNotes: null,
        disclosurePreference: "manual-review",
      },
    });
    mocks.loadCandidateProfileMock.mockResolvedValue({
      yearsOfExperience: 3,
      preferredRoles: [],
      preferredTechStack: [],
      excludedRoles: [],
      preferredLocations: [],
      excludedLocations: [],
      remotePreference: "remote",
      remoteOnly: true,
      visaRequirement: "not-required",
      languages: [],
      salaryExpectation: null,
      salaryExpectations: { usd: null, eur: null, try: null },
      gpa: null,
      linkedinUrl: null,
      workAuthorizationStatus: "authorized",
      requiresSponsorship: false,
      willingToRelocate: false,
      disability: {
        hasVisualDisability: false,
        disabilityPercentage: null,
        requiresAccommodation: null,
        accommodationNotes: null,
        disclosurePreference: "manual-review",
      },
    });
    mocks.createSnapshotMock.mockResolvedValue({ id: "snapshot_1" });

    const result = await module.main(
      ["build-profile", "--resume", "./resume.txt", "--linkedin", "https://linkedin.com/in/jane"],
      deps,
    );

    expect(result.snapshot.id).toBe("snapshot_1");
    expect(result.reportPath).toBe("artifacts/batch-runs/report.json");
    expect(mocks.createSnapshotMock).toHaveBeenCalledWith({
      data: {
        fullName: "Jane Doe",
        linkedinUrl: "https://linkedin.com/in/jane",
        resumePath: "./resume.txt",
        profileJson: JSON.stringify({
          fullName: "Jane Doe",
          linkedinUrl: "https://linkedin.com/in/jane",
          sourceMetadata: { resumePath: "./resume.txt" },
        }),
      },
    });
    expect(mocks.infoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateProfileSnapshotId: "snapshot_1",
        fullName: "Jane Doe",
      }),
      "Candidate profile snapshot saved",
    );
    expect(mocks.writeRunReportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "profile-runs",
        prefix: "build-profile",
      }),
    );
  });

  it("answers questions and saves a prepared answer set", async () => {
    const readFileMock = vi.fn().mockResolvedValue(
      JSON.stringify([{ label: "LinkedIn Profile", inputType: "text" }]),
    );
    const { module, mocks, deps } = await loadIndexModule(readFileMock);
    mocks.loadCandidateMasterProfileMock.mockResolvedValue({
      fullName: "Jane Doe",
      linkedinUrl: "https://linkedin.com/in/jane",
      sourceMetadata: { resumePath: "./resume.txt" },
    });
    mocks.loadCandidateProfileMock.mockResolvedValue({
      yearsOfExperience: 3,
      preferredRoles: [],
      preferredTechStack: [],
      excludedRoles: [],
      preferredLocations: [],
      excludedLocations: [],
      remotePreference: "remote",
      remoteOnly: true,
      visaRequirement: "not-required",
      languages: [],
      salaryExpectation: null,
      salaryExpectations: { usd: null, eur: null, try: null },
      gpa: null,
      linkedinUrl: null,
      workAuthorizationStatus: "authorized",
      requiresSponsorship: false,
      willingToRelocate: false,
      disability: {
        hasVisualDisability: false,
        disabilityPercentage: null,
        requiresAccommodation: null,
        accommodationNotes: null,
        disclosurePreference: "manual-review",
      },
    });
    mocks.loadCandidateProfileMock.mockResolvedValue({
      yearsOfExperience: 3,
      preferredRoles: [],
      preferredTechStack: [],
      excludedRoles: [],
      preferredLocations: [],
      excludedLocations: [],
      remotePreference: "remote",
      remoteOnly: true,
      visaRequirement: "not-required",
      languages: [],
      salaryExpectation: null,
      salaryExpectations: { usd: null, eur: null, try: null },
      gpa: null,
      linkedinUrl: null,
      workAuthorizationStatus: "authorized",
      requiresSponsorship: false,
      willingToRelocate: false,
      disability: {
        hasVisualDisability: false,
        disabilityPercentage: null,
        requiresAccommodation: null,
        accommodationNotes: null,
        disclosurePreference: "manual-review",
      },
    });
    mocks.createSnapshotMock.mockResolvedValue({ id: "snapshot_1" });
    mocks.resolveAnswerMock.mockResolvedValue({
      questionType: "linkedin",
      strategy: "deterministic",
      answer: "https://linkedin.com/in/jane",
      confidence: 0.98,
      confidenceLabel: "high",
      source: "candidate-profile",
    });
    mocks.createPreparedAnswerSetMock.mockResolvedValue({ id: "answers_1" });

    const result = await module.main(
      ["answer-questions", "--resume", "./resume.txt", "--questions", "./questions.json"],
      deps,
    );

    expect(result.preparedAnswerSet.id).toBe("answers_1");
    expect(result.reportPath).toBe("artifacts/batch-runs/report.json");
    expect(readFileMock).toHaveBeenCalledWith("./questions.json", "utf8");
    expect(mocks.resolveAnswerMock).toHaveBeenCalledTimes(1);
    expect(mocks.createPreparedAnswerSetMock).toHaveBeenCalledWith({
      data: {
        candidateProfileId: "snapshot_1",
        questionsJson: JSON.stringify([{ label: "LinkedIn Profile", inputType: "text" }]),
        answersJson: JSON.stringify([
          {
            question: { label: "LinkedIn Profile", inputType: "text" },
            resolved: {
              questionType: "linkedin",
              strategy: "deterministic",
              answer: "https://linkedin.com/in/jane",
              confidence: 0.98,
              confidenceLabel: "high",
              source: "candidate-profile",
            },
          },
        ]),
      },
    });
    expect(mocks.infoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        preparedAnswerSetId: "answers_1",
        answerCount: 1,
      }),
      "Prepared answer set saved",
    );
    expect(mocks.writeRunReportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "answer-runs",
        prefix: "answer-questions",
      }),
    );
  });

  it("parses build-profile and answer-questions CLI args", async () => {
    const { module } = await loadIndexModule();

    expect(
      module.parseCliArgs([
        "build-profile",
        "--resume",
        "./resume.txt",
        "--linkedin",
        "https://linkedin.com/in/jane",
      ]),
    ).toEqual({
      mode: "build-profile",
      resumePath: "./resume.txt",
      linkedinUrl: "https://linkedin.com/in/jane",
    });

    expect(
      module.parseCliArgs([
        "answer-questions",
        "--resume",
        "./resume.txt",
        "--questions",
        "./questions.json",
      ]),
    ).toEqual({
      mode: "answer-questions",
      resumePath: "./resume.txt",
      questionsPath: "./questions.json",
    });

    expect(module.parseCliArgs(["easy-apply-dry-run", "https://www.linkedin.com/jobs/view/1"]))
      .toEqual({
        mode: "easy-apply-dry-run",
        url: "https://www.linkedin.com/jobs/view/1",
        resumePath: expect.any(String),
        count: 1,
        disableAiEvaluation: false,
        scoreThreshold: 40,
      });

    expect(module.parseCliArgs(["easy-apply-dry-run"])).toEqual({
      mode: "easy-apply-dry-run",
      url: "https://www.linkedin.com/jobs/collections/easy-apply",
      resumePath: expect.any(String),
      count: 1,
      disableAiEvaluation: false,
      scoreThreshold: 40,
    });

    expect(module.parseCliArgs(["easy-apply-dry-run", "--count", "3"])).toEqual({
      mode: "easy-apply-dry-run",
      url: "https://www.linkedin.com/jobs/collections/easy-apply",
      resumePath: expect.any(String),
      count: 3,
      disableAiEvaluation: false,
      scoreThreshold: 40,
    });

    expect(module.parseCliArgs(["easy-apply-dry-run", "2"])).toEqual({
      mode: "easy-apply-dry-run",
      url: "https://www.linkedin.com/jobs/collections/easy-apply",
      resumePath: expect.any(String),
      count: 2,
      disableAiEvaluation: false,
      scoreThreshold: 40,
    });

    expect(
      module.parseCliArgs([
        "easy-apply-dry-run",
        "--disable-ai-evaluation",
        "--score-threshold",
        "60",
        "2",
      ]),
    ).toEqual({
      mode: "easy-apply-dry-run",
      url: "https://www.linkedin.com/jobs/collections/easy-apply",
      resumePath: expect.any(String),
      count: 2,
      disableAiEvaluation: true,
      scoreThreshold: 60,
    });

    expect(module.parseCliArgs(["easy-apply", "https://www.linkedin.com/jobs/view/1"])).toEqual({
      mode: "easy-apply",
      url: "https://www.linkedin.com/jobs/view/1",
      resumePath: expect.any(String),
    });

    expect(module.parseCliArgs(["easy-apply-batch"])).toEqual({
      mode: "easy-apply-batch",
      url: "https://www.linkedin.com/jobs/collections/easy-apply",
      resumePath: expect.any(String),
      count: 1,
      disableAiEvaluation: false,
      scoreThreshold: 40,
    });

    expect(
      module.parseCliArgs([
        "easy-apply-batch",
        "--disable-ai-evaluation",
        "--score-threshold",
        "60",
        "5",
      ]),
    ).toEqual({
      mode: "easy-apply-batch",
      url: "https://www.linkedin.com/jobs/collections/easy-apply",
      resumePath: expect.any(String),
      count: 5,
      disableAiEvaluation: true,
      scoreThreshold: 60,
    });
  });

  it("rejects missing candidate prep flags", async () => {
    const { module } = await loadIndexModule();

    expect(() => module.parseCliArgs(["answer-questions", "--resume", "./resume.txt"])).toThrow(
      "--questions is required",
    );
    expect(() => module.parseCliArgs(["easy-apply"])).toThrow("--url is required for easy-apply.");
    expect(() =>
      module.parseCliArgs(["easy-apply", "https://www.linkedin.com/jobs/collections/easy-apply"]),
    ).toThrow("easy-apply requires a single LinkedIn job URL");
    expect(() =>
      module.parseCliArgs(["easy-apply-batch", "https://www.linkedin.com/jobs/view/1"]),
    ).toThrow("easy-apply-batch requires a LinkedIn collection URL");
    expect(() => module.parseCliArgs(["easy-apply-dry-run", "--count", "0"])).toThrow(
      "--count must be a positive integer.",
    );
  });

  it("runs the real easy apply flow", async () => {
    const { module, mocks, deps } = await loadIndexModule();
    mocks.loadCandidateMasterProfileMock.mockResolvedValue({
      fullName: "Jane Doe",
      linkedinUrl: "https://linkedin.com/in/jane",
      sourceMetadata: { resumePath: "./resume.txt" },
    });
    mocks.createEasyApplyDriverMock.mockReturnValue({ driver: true });
    const pageRuntime = mockWithPageSuccess(mocks.withPageMock);
    mocks.runEasyApplyMock.mockResolvedValue({
      status: "submitted",
      steps: [],
      stopReason: "Application submitted successfully.",
      url: "https://www.linkedin.com/jobs/view/1",
    });

    const result = await module.main(
      ["easy-apply", "https://www.linkedin.com/jobs/view/1", "--resume", "./resume.txt"],
      deps,
    );

    expect(result.easyApply.status).toBe("submitted");
    expect(result.reportPath).toBe("artifacts/batch-runs/report.json");
    expect(mocks.runEasyApplyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://www.linkedin.com/jobs/view/1",
        candidateProfile: expect.objectContaining({
          fullName: "Jane Doe",
        }),
      }),
    );
    expect(mocks.runEasyApplyDryRunMock).not.toHaveBeenCalled();
    expect(mocks.runEasyApplyBatchDryRunMock).not.toHaveBeenCalled();
    expect(mocks.infoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "submitted",
        stepCount: 0,
      }),
      "LinkedIn Easy Apply finished",
    );
    expect(mocks.writeRunReportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "easy-apply-runs",
        prefix: "easy-apply",
      }),
    );
  });

  it("wraps real easy apply flow failures with a linkedin phase error", async () => {
    const { module, mocks, deps } = await loadIndexModule();
    mocks.loadCandidateMasterProfileMock.mockResolvedValue({
      fullName: "Jane Doe",
      linkedinUrl: "https://linkedin.com/in/jane",
      sourceMetadata: { resumePath: "./resume.txt" },
    });
    mocks.createEasyApplyDriverMock.mockReturnValue({ driver: true });
    const pageRuntime = mockWithPageSuccess(mocks.withPageMock);
    mocks.runEasyApplyMock.mockRejectedValue(new Error("submit failed"));

    await expect(
      module.main(
        ["easy-apply", "https://www.linkedin.com/jobs/view/1", "--resume", "./resume.txt"],
        deps,
      ),
    ).rejects.toMatchObject({
      name: "AppError",
      phase: "linkedin_easy_apply",
      code: "LINKEDIN_EASY_APPLY_FAILED",
      message: "LinkedIn Easy Apply flow failed.",
    });
  });

  it("runs the real easy apply batch flow", async () => {
    const { module, mocks, deps } = await loadIndexModule();
    mocks.loadCandidateMasterProfileMock.mockResolvedValue({
      fullName: "Jane Doe",
      linkedinUrl: "https://linkedin.com/in/jane",
      sourceMetadata: { resumePath: "./resume.txt" },
    });
    mocks.loadCandidateProfileMock.mockResolvedValue({
      yearsOfExperience: 3,
      preferredRoles: [],
      preferredTechStack: [],
      excludedRoles: [],
      preferredLocations: [],
      excludedLocations: [],
      remotePreference: "remote",
      remoteOnly: true,
      visaRequirement: "not-required",
      languages: [],
      salaryExpectation: null,
      salaryExpectations: { usd: null, eur: null, try: null },
      gpa: null,
      linkedinUrl: null,
      workAuthorizationStatus: "authorized",
      requiresSponsorship: false,
      willingToRelocate: false,
      disability: {
        hasVisualDisability: false,
        disabilityPercentage: null,
        requiresAccommodation: null,
        accommodationNotes: null,
        disclosurePreference: "manual-review",
      },
    });
    mocks.createEasyApplyDriverMock.mockReturnValue({ driver: true });
    const pageRuntime = mockWithPageSuccess(mocks.withPageMock);
    mocks.runEasyApplyBatchMock.mockResolvedValue({
      status: "completed",
      collectionUrl: "https://www.linkedin.com/jobs/collections/easy-apply",
      requestedCount: 2,
      attemptedCount: 2,
      evaluatedCount: 4,
      skippedCount: 2,
      pagesVisited: 2,
      jobs: [],
      stopReason: "Processed 2 LinkedIn Easy Apply job(s).",
    });

    const result = await module.main(
      ["easy-apply-batch", "--count", "2", "--resume", "./resume.txt"],
      deps,
    );

    expect(result.easyApply.status).toBe("completed");
    expect(result.reportPath).toBe("artifacts/batch-runs/report.json");
    expect(mocks.runEasyApplyBatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://www.linkedin.com/jobs/collections/easy-apply",
        targetCount: 2,
      }),
    );
    expect(mocks.writeRunReportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "batch-runs",
        prefix: "easy-apply-batch",
      }),
    );
    expect(mocks.runEasyApplyDryRunMock).not.toHaveBeenCalled();
    expect(mocks.runEasyApplyBatchDryRunMock).not.toHaveBeenCalled();
    expect(mocks.infoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
        attemptedCount: 2,
        evaluatedCount: 4,
        skippedCount: 2,
        requestedCount: 2,
        pagesVisited: 2,
      }),
      "LinkedIn Easy Apply batch finished",
    );
  });

  it("wraps real easy apply batch failures with a linkedin phase error", async () => {
    const { module, mocks, deps } = await loadIndexModule();
    mocks.loadCandidateMasterProfileMock.mockResolvedValue({
      fullName: "Jane Doe",
      linkedinUrl: "https://linkedin.com/in/jane",
      sourceMetadata: { resumePath: "./resume.txt" },
    });
    mocks.loadCandidateProfileMock.mockResolvedValue({
      yearsOfExperience: 3,
      preferredRoles: [],
      preferredTechStack: [],
      excludedRoles: [],
      preferredLocations: [],
      excludedLocations: [],
      remotePreference: "remote",
      remoteOnly: true,
      visaRequirement: "not-required",
      languages: [],
      salaryExpectation: null,
      salaryExpectations: { usd: null, eur: null, try: null },
      gpa: null,
      linkedinUrl: null,
      workAuthorizationStatus: "authorized",
      requiresSponsorship: false,
      willingToRelocate: false,
      disability: {
        hasVisualDisability: false,
        disabilityPercentage: null,
        requiresAccommodation: null,
        accommodationNotes: null,
        disclosurePreference: "manual-review",
      },
    });
    mocks.createEasyApplyDriverMock.mockReturnValue({ driver: true });
    const pageRuntime = mockWithPageSuccess(mocks.withPageMock);
    mocks.runEasyApplyBatchMock.mockRejectedValue(new Error("batch failed"));

    await expect(
      module.main(
        ["easy-apply-batch", "--count", "2", "--resume", "./resume.txt"],
        deps,
      ),
    ).rejects.toMatchObject({
      name: "AppError",
      phase: "linkedin_easy_apply",
      code: "LINKEDIN_EASY_APPLY_FAILED",
      message: "LinkedIn Easy Apply flow failed.",
    });
  });

  it("supports score and default decide parsing", async () => {
    const { module } = await loadIndexModule();

    expect(module.parseCliArgs(["score", "https://jobs.example.com/1"])).toEqual({
      mode: "score",
      url: "https://jobs.example.com/1",
    });
    expect(module.parseCliArgs(["https://jobs.example.com/1"])).toEqual({
      mode: "decide",
      url: "https://jobs.example.com/1",
    });
  });

  it("runs the easy apply dry-run flow", async () => {
    const { module, mocks, deps } = await loadIndexModule();
    mocks.loadCandidateMasterProfileMock.mockResolvedValue({
      fullName: "Jane Doe",
      linkedinUrl: "https://linkedin.com/in/jane",
      sourceMetadata: { resumePath: "./resume.txt" },
    });
    mocks.loadCandidateProfileMock.mockResolvedValue({
      yearsOfExperience: 3,
      preferredRoles: [],
      preferredTechStack: [],
      excludedRoles: [],
      preferredLocations: [],
      excludedLocations: [],
      remotePreference: "remote",
      remoteOnly: true,
      visaRequirement: "not-required",
      languages: [],
      salaryExpectation: null,
      salaryExpectations: { usd: null, eur: null, try: null },
      gpa: null,
      linkedinUrl: null,
      workAuthorizationStatus: "authorized",
      requiresSponsorship: false,
      willingToRelocate: false,
      disability: {
        hasVisualDisability: false,
        disabilityPercentage: null,
        requiresAccommodation: null,
        accommodationNotes: null,
        disclosurePreference: "manual-review",
      },
    });
    mocks.createEasyApplyDriverMock.mockReturnValue({ driver: true });
    mockWithPageSuccess(mocks.withPageMock);
    mocks.runEasyApplyDryRunMock.mockResolvedValue({
      status: "ready_to_submit",
      steps: [],
      stopReason: "Reached the final submit step. Dry run stops before submission.",
      url: "https://www.linkedin.com/jobs/view/1",
    });
    mocks.runEasyApplyBatchDryRunMock.mockResolvedValue({
      status: "completed",
      collectionUrl: "https://www.linkedin.com/jobs/collections/easy-apply",
      requestedCount: 1,
      attemptedCount: 1,
      evaluatedCount: 1,
      skippedCount: 0,
      pagesVisited: 1,
      jobs: [],
      stopReason: "Processed 1 LinkedIn Easy Apply job(s).",
    });

    const result = await module.main(
      ["easy-apply-dry-run", "https://www.linkedin.com/jobs/view/1", "--resume", "./resume.txt"],
      deps,
    );

    expect(result.easyApply.status).toBe("ready_to_submit");
    expect(result.reportPath).toBe("artifacts/batch-runs/report.json");
    expect(mocks.createEasyApplyDriverMock).toHaveBeenCalled();
    expect(mocks.runEasyApplyDryRunMock).toHaveBeenCalled();
    expect(mocks.runEasyApplyBatchDryRunMock).not.toHaveBeenCalled();
    expect(mocks.infoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "ready_to_submit",
        stepCount: 0,
      }),
      "LinkedIn Easy Apply dry run finished",
    );
    expect(mocks.writeRunReportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "easy-apply-runs",
        prefix: "easy-apply-dry-run",
      }),
    );
  });

  it("switches to batch mode for collection URLs and logs batch progress", async () => {
    const { module, mocks, deps } = await loadIndexModule();
    mocks.loadCandidateMasterProfileMock.mockResolvedValue({
      fullName: "Jane Doe",
      linkedinUrl: "https://linkedin.com/in/jane",
      sourceMetadata: { resumePath: "./resume.txt" },
    });
    mocks.createEasyApplyDriverMock.mockReturnValue({ driver: true });
    mockWithPageSuccess(mocks.withPageMock);
    mocks.runEasyApplyBatchDryRunMock.mockResolvedValue({
      status: "completed",
      collectionUrl: "https://www.linkedin.com/jobs/collections/easy-apply",
      requestedCount: 3,
      attemptedCount: 3,
      evaluatedCount: 5,
      skippedCount: 2,
      pagesVisited: 2,
      jobs: [
        {
          url: "https://www.linkedin.com/jobs/view/1",
          evaluation: {
            shouldApply: true,
            finalDecision: "APPLY",
            score: 82,
            reason: "Strong fit.",
            policyAllowed: true,
          },
          result: {
            status: "ready_to_submit",
            steps: [],
            stopReason: "Reached the final submit step. Dry run stops before submission.",
            url: "https://www.linkedin.com/jobs/view/1",
          },
        },
      ],
      stopReason: "Processed 3 LinkedIn Easy Apply job(s).",
    });

    const result = await module.main(
      ["easy-apply-dry-run", "--count", "3", "--resume", "./resume.txt"],
      deps,
    );

    expect(result.easyApply.status).toBe("completed");
    expect(result.reportPath).toBe("artifacts/batch-runs/report.json");
    expect(mocks.runEasyApplyBatchDryRunMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://www.linkedin.com/jobs/collections/easy-apply",
        targetCount: 3,
      }),
    );
    expect(mocks.runEasyApplyDryRunMock).not.toHaveBeenCalled();
    expect(mocks.writeRunReportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "batch-runs",
        prefix: "easy-apply-dry-run",
      }),
    );
    expect(mocks.infoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
        attemptedCount: 3,
        evaluatedCount: 5,
        skippedCount: 2,
        requestedCount: 3,
        pagesVisited: 2,
      }),
      "LinkedIn Easy Apply dry run finished",
    );
  });

  it("builds an evaluation callback for batch easy apply and scores discovered jobs", async () => {
    const { module, mocks, deps } = await loadIndexModule();
    mocks.loadCandidateMasterProfileMock.mockResolvedValue({
      fullName: "Jane Doe",
      linkedinUrl: "https://linkedin.com/in/jane",
      sourceMetadata: { resumePath: "./resume.txt" },
    });
    mocks.loadCandidateProfileMock.mockResolvedValue({
      yearsOfExperience: 3,
      preferredRoles: ["Backend Engineer"],
      preferredTechStack: ["TypeScript"],
      excludedRoles: [],
      preferredLocations: [],
      excludedLocations: [],
      remotePreference: "remote",
      remoteOnly: true,
      visaRequirement: "not-required",
      languages: [],
      salaryExpectation: null,
      salaryExpectations: { usd: null, eur: null, try: null },
      gpa: null,
      linkedinUrl: null,
      workAuthorizationStatus: "authorized",
      requiresSponsorship: false,
      willingToRelocate: false,
      disability: {
        hasVisualDisability: false,
        disabilityPercentage: null,
        requiresAccommodation: null,
        accommodationNotes: null,
        disclosurePreference: "manual-review",
      },
    });
    mocks.createEasyApplyDriverMock.mockReturnValue({ driver: true });
    const pageRuntime = mockWithPageSuccess(mocks.withPageMock);
    mocks.runEasyApplyBatchDryRunMock.mockResolvedValue({
      status: "completed",
      collectionUrl: "https://www.linkedin.com/jobs/collections/easy-apply",
      requestedCount: 2,
      attemptedCount: 1,
      evaluatedCount: 2,
      skippedCount: 1,
      pagesVisited: 1,
      jobs: [],
      stopReason: "Processed 1 LinkedIn Easy Apply job(s).",
    });
    deps.extractJobText = vi.fn().mockResolvedValue({
      rawText: "Job body",
      title: "Backend Engineer",
      company: "Acme",
      location: "Remote",
      platform: "linkedin",
      applicationType: "easy_apply",
      applyUrl: "https://linkedin.com/apply",
      currentUrl: "https://www.linkedin.com/jobs/view/1",
      descriptionText: "TypeScript backend role",
      requirementsText: "Need TypeScript",
      benefitsText: null,
    });
    deps.formatJobForLLM = vi.fn().mockReturnValue("Formatted prompt");
    deps.parseJob = vi.fn().mockResolvedValue({
      parsed: {
        title: "Backend Engineer",
        company: "Acme",
        location: "Remote",
        platform: "linkedin",
        seniority: "mid",
        mustHaveSkills: ["TypeScript"],
        niceToHaveSkills: [],
        technologies: ["TypeScript"],
        yearsRequired: 3,
        remoteType: "remote",
        visaSponsorship: "no",
        workAuthorization: "authorized",
      },
      provider: "local",
      model: "openai/gpt-oss-20b",
      rawText: "{}",
    });
    deps.normalizeParsedJob = vi.fn().mockReturnValue({
      title: "Backend Engineer",
      company: "Acme",
      location: "Remote",
      remoteType: "remote",
      seniority: "mid",
      mustHaveSkills: ["TypeScript"],
      niceToHaveSkills: [],
      technologies: ["TypeScript"],
      yearsRequired: 3,
      platform: "linkedin",
      applicationType: "easy_apply",
      visaSponsorship: "no",
      workAuthorization: "authorized",
      openQuestionsCount: 0,
    });
    deps.scoreJob = vi.fn().mockReturnValue({
      totalScore: 81,
      breakdown: { skill: 30, seniority: 18, location: 20, tech: 10, bonus: 3 },
    });
    deps.evaluatePolicy = vi.fn().mockReturnValue({ allowed: true, reasons: [] });

    await module.main(
      ["easy-apply-dry-run", "--count", "2", "--resume", "./resume.txt"],
      deps,
    );

    const batchArgs = mocks.runEasyApplyBatchDryRunMock.mock.calls[0]?.[0];
    const evaluation = await batchArgs.evaluateJob("https://www.linkedin.com/jobs/view/1");

    expect(evaluation).toEqual({
      shouldApply: true,
      finalDecision: "APPLY",
      score: 81,
      reason: "Score 81 meets the configured threshold of 40.",
      policyAllowed: true,
    });
    expect(deps.extractJobText).toHaveBeenCalled();
    expect(deps.formatJobForLLM).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Backend Engineer" }),
    );
    expect(deps.parseJob).toHaveBeenCalledWith("Formatted prompt");
    expect(deps.scoreJob).toHaveBeenCalled();
    expect(deps.evaluatePolicy).toHaveBeenCalled();
    expect(mocks.infoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://www.linkedin.com/jobs/view/1",
        finalDecision: "APPLY",
        totalScore: 81,
        scoreThreshold: 40,
      }),
      "LinkedIn Easy Apply job evaluated",
    );
    expect(mocks.withPageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        persistentProfilePath: ".auth/linkedin-profile",
        storageStatePath: ".auth/linkedin-session.json",
        persistStorageState: true,
      }),
      expect.any(Function),
    );
    expect(mocks.withPageMock).toHaveBeenCalledTimes(1);
    expect(pageRuntime.newEvaluationPageMock).toHaveBeenCalledTimes(1);
    expect(pageRuntime.evaluationPage.close).toHaveBeenCalledTimes(1);
  });

  it("reuses a shared batch evaluation page instead of launching nested browser sessions", async () => {
    const { module, mocks, deps } = await loadIndexModule();
    mocks.loadCandidateMasterProfileMock.mockResolvedValue({
      fullName: "Jane Doe",
      linkedinUrl: "https://linkedin.com/in/jane",
      sourceMetadata: { resumePath: "./resume.txt" },
    });
    mocks.loadCandidateProfileMock.mockResolvedValue({
      yearsOfExperience: 3,
      preferredRoles: ["Backend Engineer"],
      preferredTechStack: ["TypeScript"],
      aspirationalTechStack: [],
      excludedRoles: [],
      preferredLocations: [],
      excludedLocations: [],
      allowedHybridLocations: ["Ankara"],
      remotePreference: "remote",
      remoteOnly: true,
      visaRequirement: "not-required",
      languages: [],
      salaryExpectation: null,
      salaryExpectations: { usd: null, eur: null, try: null },
      gpa: null,
      linkedinUrl: null,
      workAuthorizationStatus: "authorized",
      requiresSponsorship: false,
      willingToRelocate: false,
      disability: {
        hasVisualDisability: false,
        disabilityPercentage: null,
        requiresAccommodation: null,
        accommodationNotes: null,
        disclosurePreference: "manual-review",
      },
    });
    mocks.createEasyApplyDriverMock.mockReturnValue({ driver: true });
    const pageRuntime = mockWithPageSuccess(mocks.withPageMock);
    mocks.runEasyApplyBatchDryRunMock.mockResolvedValue({
      status: "completed",
      collectionUrl: "https://www.linkedin.com/jobs/collections/easy-apply",
      requestedCount: 2,
      attemptedCount: 1,
      evaluatedCount: 2,
      skippedCount: 1,
      pagesVisited: 1,
      jobs: [],
      stopReason: "Processed 1 LinkedIn Easy Apply job(s).",
    });
    deps.extractJobText = vi.fn().mockResolvedValue({
      rawText: "Job body",
      title: "Backend Engineer",
      company: "Acme",
      location: "Remote",
      platform: "linkedin",
      applicationType: "easy_apply",
      applyUrl: "https://linkedin.com/apply",
      currentUrl: "https://www.linkedin.com/jobs/view/1",
      descriptionText: "TypeScript backend role",
      requirementsText: "Need TypeScript",
      benefitsText: null,
    });
    deps.formatJobForLLM = vi.fn().mockReturnValue("Formatted prompt");
    deps.parseJob = vi.fn().mockResolvedValue({
      parsed: {
        title: "Backend Engineer",
        company: "Acme",
        location: "Remote",
        platform: "linkedin",
        seniority: "mid",
        mustHaveSkills: ["TypeScript"],
        niceToHaveSkills: [],
        technologies: ["TypeScript"],
        yearsRequired: 3,
        remoteType: "remote",
        visaSponsorship: "no",
        workAuthorization: "authorized",
      },
      provider: "local",
      model: "openai/gpt-oss-20b",
      rawText: "{}",
    });
    deps.normalizeParsedJob = vi.fn().mockReturnValue({
      title: "Backend Engineer",
      company: "Acme",
      location: "Remote",
      remoteType: "remote",
      seniority: "mid",
      mustHaveSkills: ["TypeScript"],
      niceToHaveSkills: [],
      technologies: ["TypeScript"],
      yearsRequired: 3,
      platform: "linkedin",
      applicationType: "easy_apply",
      visaSponsorship: "no",
      workAuthorization: "authorized",
      openQuestionsCount: 0,
    });
    deps.scoreJob = vi.fn().mockReturnValue({
      totalScore: 81,
      breakdown: { skill: 30, seniority: 18, location: 20, tech: 10, bonus: 3 },
    });
    deps.evaluatePolicy = vi.fn().mockReturnValue({ allowed: true, reasons: [] });

    await module.main(
      ["easy-apply-dry-run", "--count", "2", "--resume", "./resume.txt"],
      deps,
    );

    const batchArgs = mocks.runEasyApplyBatchDryRunMock.mock.calls[0]?.[0];
    await batchArgs.evaluateJob("https://www.linkedin.com/jobs/view/1");
    await batchArgs.evaluateJob("https://www.linkedin.com/jobs/view/2");

    expect(mocks.withPageMock).toHaveBeenCalledTimes(1);
    expect(pageRuntime.newEvaluationPageMock).toHaveBeenCalledTimes(1);
    expect(deps.extractJobText).toHaveBeenNthCalledWith(
      1,
      pageRuntime.evaluationPage,
      "https://www.linkedin.com/jobs/view/1",
    );
    expect(deps.extractJobText).toHaveBeenNthCalledWith(
      2,
      pageRuntime.evaluationPage,
      "https://www.linkedin.com/jobs/view/2",
    );
  });

  it("uses the configured score threshold when evaluating batch jobs", async () => {
    const { module, mocks, deps } = await loadIndexModule();
    mocks.loadCandidateMasterProfileMock.mockResolvedValue({
      fullName: "Jane Doe",
      linkedinUrl: "https://linkedin.com/in/jane",
      sourceMetadata: { resumePath: "./resume.txt" },
    });
    mocks.loadCandidateProfileMock.mockResolvedValue({
      yearsOfExperience: 3,
      preferredRoles: ["Backend Engineer"],
      preferredTechStack: ["TypeScript"],
      excludedRoles: [],
      preferredLocations: [],
      excludedLocations: [],
      remotePreference: "remote",
      remoteOnly: true,
      visaRequirement: "not-required",
      languages: [],
      salaryExpectation: null,
      salaryExpectations: { usd: null, eur: null, try: null },
      gpa: null,
      linkedinUrl: null,
      workAuthorizationStatus: "authorized",
      requiresSponsorship: false,
      willingToRelocate: false,
      disability: {
        hasVisualDisability: false,
        disabilityPercentage: null,
        requiresAccommodation: null,
        accommodationNotes: null,
        disclosurePreference: "manual-review",
      },
    });
    mocks.createEasyApplyDriverMock.mockReturnValue({ driver: true });
    mockWithPageSuccess(mocks.withPageMock);
    mocks.runEasyApplyBatchDryRunMock.mockResolvedValue({
      status: "completed",
      collectionUrl: "https://www.linkedin.com/jobs/collections/easy-apply",
      requestedCount: 1,
      attemptedCount: 0,
      evaluatedCount: 1,
      skippedCount: 1,
      pagesVisited: 1,
      jobs: [],
      stopReason: "Only found and processed 0 matching LinkedIn Easy Apply job(s) before pagination ended.",
    });
    deps.extractJobText = vi.fn().mockResolvedValue({
      rawText: "Job body",
      title: "Backend Engineer",
      company: "Acme",
      location: "Remote",
      platform: "linkedin",
      applicationType: "easy_apply",
      applyUrl: "https://linkedin.com/apply",
      currentUrl: "https://www.linkedin.com/jobs/view/1",
      descriptionText: "TypeScript backend role",
      requirementsText: "Need TypeScript",
      benefitsText: null,
    });
    deps.formatJobForLLM = vi.fn().mockReturnValue("Formatted prompt");
    deps.parseJob = vi.fn().mockResolvedValue({
      parsed: {
        title: "Backend Engineer",
        company: "Acme",
        location: "Remote",
        platform: "linkedin",
        seniority: "mid",
        mustHaveSkills: ["TypeScript"],
        niceToHaveSkills: [],
        technologies: ["TypeScript"],
        yearsRequired: 3,
        remoteType: "remote",
        visaSponsorship: "no",
        workAuthorization: "authorized",
      },
      provider: "local",
      model: "openai/gpt-oss-20b",
      rawText: "{}",
    });
    deps.normalizeParsedJob = vi.fn().mockReturnValue({
      title: "Backend Engineer",
      company: "Acme",
      location: "Remote",
      remoteType: "remote",
      seniority: "mid",
      mustHaveSkills: ["TypeScript"],
      niceToHaveSkills: [],
      technologies: ["TypeScript"],
      yearsRequired: 3,
      platform: "linkedin",
      applicationType: "easy_apply",
      visaSponsorship: "no",
      workAuthorization: "authorized",
      openQuestionsCount: 0,
    });
    deps.scoreJob = vi.fn().mockReturnValue({
      totalScore: 74,
      breakdown: { skill: 28, seniority: 18, location: 18, tech: 8, bonus: 2 },
    });
    deps.evaluatePolicy = vi.fn().mockReturnValue({ allowed: true, reasons: [] });

    await module.main(
      ["easy-apply-dry-run", "--score-threshold", "80", "--resume", "./resume.txt"],
      deps,
    );

    const batchArgs = mocks.runEasyApplyBatchDryRunMock.mock.calls[0]?.[0];
    const evaluation = await batchArgs.evaluateJob("https://www.linkedin.com/jobs/view/1");

    expect(evaluation).toEqual({
      shouldApply: false,
      finalDecision: "SKIP",
      score: 74,
      reason: "Score 74 is below the configured threshold of 80.",
      policyAllowed: true,
    });
  });

  it("skips AI evaluation entirely when disabled for batch runs", async () => {
    const { module, mocks, deps } = await loadIndexModule();
    mocks.loadCandidateMasterProfileMock.mockResolvedValue({
      fullName: "Jane Doe",
      linkedinUrl: "https://linkedin.com/in/jane",
      sourceMetadata: { resumePath: "./resume.txt" },
    });
    mocks.loadCandidateProfileMock.mockResolvedValue({
      yearsOfExperience: 3,
      preferredRoles: [],
      preferredTechStack: [],
      excludedRoles: [],
      preferredLocations: [],
      excludedLocations: [],
      remotePreference: "remote",
      remoteOnly: true,
      visaRequirement: "not-required",
      languages: [],
      salaryExpectation: null,
      salaryExpectations: { usd: null, eur: null, try: null },
      gpa: null,
      linkedinUrl: null,
      workAuthorizationStatus: "authorized",
      requiresSponsorship: false,
      willingToRelocate: false,
      disability: {
        hasVisualDisability: false,
        disabilityPercentage: null,
        requiresAccommodation: null,
        accommodationNotes: null,
        disclosurePreference: "manual-review",
      },
    });
    mocks.createEasyApplyDriverMock.mockReturnValue({ driver: true });
    mockWithPageSuccess(mocks.withPageMock);
    mocks.runEasyApplyBatchDryRunMock.mockResolvedValue({
      status: "completed",
      collectionUrl: "https://www.linkedin.com/jobs/collections/easy-apply",
      requestedCount: 1,
      attemptedCount: 1,
      evaluatedCount: 1,
      skippedCount: 0,
      pagesVisited: 1,
      jobs: [],
      stopReason: "Processed 1 LinkedIn Easy Apply job(s).",
    });

    await module.main(
      ["easy-apply-dry-run", "--disable-ai-evaluation", "--resume", "./resume.txt"],
      deps,
    );

    const batchArgs = mocks.runEasyApplyBatchDryRunMock.mock.calls[0]?.[0];
    const evaluation = await batchArgs.evaluateJob("https://www.linkedin.com/jobs/view/1");

    expect(evaluation).toEqual({
      shouldApply: true,
      finalDecision: "APPLY",
      score: 0,
      reason: "AI evaluation disabled for this batch run.",
      policyAllowed: true,
    });
    expect(mocks.extractJobTextMock).not.toHaveBeenCalled();
  });

  it("wraps build-profile snapshot failures with a database phase error", async () => {
    const { module, mocks, deps } = await loadIndexModule();
    mocks.loadCandidateMasterProfileMock.mockResolvedValue({
      fullName: "Jane Doe",
      linkedinUrl: "https://linkedin.com/in/jane",
      sourceMetadata: { resumePath: "./resume.txt" },
    });
    mocks.createSnapshotMock.mockRejectedValue(new Error("sqlite busy"));

    await expect(
      module.main(["build-profile", "--resume", "./resume.txt"], deps),
    ).rejects.toMatchObject({
      name: "AppError",
      phase: "database",
      code: "DATABASE_CANDIDATE_SNAPSHOT_FAILED",
    });
  });

  it("wraps prepared answer persistence failures with a database phase error", async () => {
    const readFileMock = vi.fn().mockResolvedValue(
      JSON.stringify([{ label: "LinkedIn Profile", inputType: "text" }]),
    );
    const { module, mocks, deps } = await loadIndexModule(readFileMock);
    mocks.loadCandidateMasterProfileMock.mockResolvedValue({
      fullName: "Jane Doe",
      linkedinUrl: "https://linkedin.com/in/jane",
      sourceMetadata: { resumePath: "./resume.txt" },
    });
    mocks.createSnapshotMock.mockResolvedValue({ id: "snapshot_1" });
    mocks.resolveAnswerMock.mockResolvedValue({
      questionType: "linkedin",
      strategy: "deterministic",
      answer: "https://linkedin.com/in/jane",
      confidence: 0.98,
      confidenceLabel: "high",
      source: "candidate-profile",
    });
    mocks.createPreparedAnswerSetMock.mockRejectedValue(new Error("sqlite busy"));

    await expect(
      module.main(
        ["answer-questions", "--resume", "./resume.txt", "--questions", "./questions.json"],
        deps,
      ),
    ).rejects.toMatchObject({
      name: "AppError",
      phase: "database",
      code: "DATABASE_PREPARED_ANSWERS_FAILED",
    });
  });

  it("wraps easy apply flow failures with a linkedin phase error", async () => {
    const { module, mocks, deps } = await loadIndexModule();
    mocks.loadCandidateMasterProfileMock.mockResolvedValue({
      fullName: "Jane Doe",
      linkedinUrl: "https://linkedin.com/in/jane",
      sourceMetadata: { resumePath: "./resume.txt" },
    });
    mocks.createEasyApplyDriverMock.mockReturnValue({ driver: true });
    mockWithPageSuccess(mocks.withPageMock);
    mocks.runEasyApplyDryRunMock.mockRejectedValue(new Error("login wall"));
    mocks.runEasyApplyBatchDryRunMock.mockResolvedValue({
      status: "completed",
      collectionUrl: "https://www.linkedin.com/jobs/collections/easy-apply",
      requestedCount: 1,
      attemptedCount: 1,
      evaluatedCount: 1,
      skippedCount: 0,
      pagesVisited: 1,
      jobs: [],
      stopReason: "Processed 1 LinkedIn Easy Apply job(s).",
    });

    await expect(
      module.main(
        ["easy-apply-dry-run", "https://www.linkedin.com/jobs/view/1", "--resume", "./resume.txt"],
        deps,
      ),
    ).rejects.toMatchObject({
      name: "AppError",
      phase: "linkedin_easy_apply",
      code: "LINKEDIN_EASY_APPLY_FAILED",
      message: "LinkedIn Easy Apply flow failed.",
    });
  });

  it("runs the provider-aware scoring flow and saves the decision", async () => {
    const { module, mocks, deps } = await loadIndexModule();
    const extracted = {
      rawText: "Raw body",
      title: "Adapter Title",
      company: "Adapter Company",
      companyLogoUrl: null,
      companyLinkedinUrl: null,
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

    mockWithPageSuccess(mocks.withPageMock);
    mocks.loadCandidateProfileMock.mockResolvedValue({ yearsOfExperience: 3 });
    mocks.extractJobTextMock.mockResolvedValue(extracted);
    mocks.formatJobForLLMMock.mockReturnValue("Formatted prompt");
    mocks.parseJobMock.mockResolvedValue({
      parsed,
      provider: "local",
      model: "openai/gpt-oss-20b",
      rawText: "{\"title\":\"Adapter Title\"}",
    });
    mocks.normalizeParsedJobMock.mockReturnValue(normalized);
    mocks.scoreJobMock.mockReturnValue({
      totalScore: 82,
      breakdown: { skill: 30, seniority: 12, location: 20, tech: 15, bonus: 5 },
    });
    mocks.evaluatePolicyMock.mockReturnValue({ allowed: true, reasons: [] });
    mocks.decideJobMock.mockReturnValue({ decision: "APPLY", reason: "Strong fit." });
    mocks.upsertMock.mockResolvedValue({ id: "job_1", company: "Adapter Company" });
    mocks.createDecisionMock.mockResolvedValue({ id: "decision_1" });

    const result = await module.main(["https://jobs.example.com/1"], deps);

    expect(mocks.getConfiguredProviderInfoMock).toHaveBeenCalledTimes(1);
    expect(mocks.parseJobMock).toHaveBeenCalledWith("Formatted prompt");
    expect(result.finalDecision).toBe("APPLY");
    expect(result.reportPath).toBe("artifacts/batch-runs/report.json");
    expect(result.jobPosting.id).toBe("job_1");
    expect(mocks.upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { url: "https://jobs.example.com/1" },
        update: expect.objectContaining({
          rawText: "Raw body",
          title: "Adapter Title",
          company: "Adapter Company",
          companyLogoUrl: null,
          companyLinkedinUrl: null,
          firmId: "firm_1",
          location: "Adapter Location",
          platform: "greenhouse",
          parsedJson: JSON.stringify(parsed),
          normalizedJson: JSON.stringify(normalized),
          parseVersion: "phase-5",
        }),
        create: expect.objectContaining({
          url: "https://jobs.example.com/1",
          rawText: "Raw body",
          title: "Adapter Title",
          company: "Adapter Company",
          companyLogoUrl: null,
          companyLinkedinUrl: null,
          firmId: "firm_1",
          location: "Adapter Location",
          platform: "greenhouse",
          parsedJson: JSON.stringify(parsed),
          normalizedJson: JSON.stringify(normalized),
          parseVersion: "phase-5",
        }),
      }),
    );
    expect(mocks.createDecisionMock).toHaveBeenCalledWith({
      data: {
        jobPostingId: "job_1",
        score: 82,
        decision: "APPLY",
        policyAllowed: true,
        reasons: JSON.stringify(["Strong fit."]),
      },
    });
    expect(mocks.createJobReviewHistoryMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobPostingId: "job_1",
        jobUrl: "https://jobs.example.com/1",
        source: "decide",
        status: "EVALUATED",
        score: 82,
        decision: "APPLY",
      }),
    });
    expect(mocks.createSystemLogMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        level: "INFO",
        scope: "job.analysis",
        message: "Starting job analysis flow.",
        runType: "decide",
        jobUrl: "https://jobs.example.com/1",
      }),
    });
    expect(mocks.infoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "local",
        model: "openai/gpt-oss-20b",
      }),
      "Using LLM provider: local (openai/gpt-oss-20b)",
    );
    expect(mocks.infoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        parsed,
        normalized,
        provider: "local",
      }),
      "Job parsed and normalized",
    );
    expect(mocks.infoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        breakdown: { skill: 30, seniority: 12, location: 20, tech: 15, bonus: 5 },
        totalScore: 82,
      }),
      "Job scored",
    );
    expect(mocks.writeRunReportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "job-runs",
        prefix: "decide",
      }),
    );
  });

  it("skips duplicate batch reviews based on stored history", async () => {
    const { module, mocks, deps } = await loadIndexModule();
    mocks.loadCandidateMasterProfileMock.mockResolvedValue({
      fullName: "Jane Doe",
      linkedinUrl: "https://linkedin.com/in/jane",
      sourceMetadata: { resumePath: "./resume.txt" },
    });
    mocks.loadCandidateProfileMock.mockResolvedValue({
      yearsOfExperience: 3,
      preferredRoles: [],
      preferredTechStack: [],
      excludedRoles: [],
      preferredLocations: [],
      excludedLocations: [],
      allowedHybridLocations: ["Ankara"],
      remotePreference: "remote",
      remoteOnly: false,
      visaRequirement: "not-required",
      workAuthorizationStatus: "authorized",
      languages: [],
      experienceOverrides: {},
      salaryExpectations: { usd: null, eur: null, try: null },
      salaryExpectation: null,
      gpa: null,
      disability: {
        hasVisualDisability: false,
        disabilityPercentage: null,
        requiresAccommodation: null,
        accommodationNotes: null,
        disclosurePreference: "manual-review",
      },
    });
    mocks.createEasyApplyDriverMock.mockReturnValue({ driver: true });
    mockWithPageSuccess(mocks.withPageMock);
    mocks.findFirstJobReviewHistoryMock.mockResolvedValue({
      createdAt: new Date("2026-03-29T10:00:00.000Z"),
      status: "SKIPPED",
      decision: "SKIP",
      score: 47,
      policyAllowed: false,
    });
    mocks.runEasyApplyBatchDryRunMock.mockImplementation(async (input) => ({
      status: "completed",
      collectionUrl: input.url,
      requestedCount: 1,
      attemptedCount: 0,
      evaluatedCount: 1,
      skippedCount: 1,
      pagesVisited: 1,
      jobs: [
        {
          url: "https://www.linkedin.com/jobs/view/1",
          evaluation: await input.evaluateJob("https://www.linkedin.com/jobs/view/1"),
        },
      ],
      stopReason: "Only found and processed 0 matching LinkedIn Easy Apply job(s) before pagination ended.",
    }));

    const result = await module.main(
      ["easy-apply-dry-run", "https://www.linkedin.com/jobs/collections/easy-apply", "--resume", "./resume.txt"],
      deps,
    );

    expect(result.easyApply.jobs[0].evaluation).toEqual({
      shouldApply: false,
      finalDecision: "SKIP",
      score: 47,
      reason:
        "Job was already reviewed on 2026-03-29 with status SKIPPED, score 47, decision SKIP.",
      policyAllowed: false,
    });
    expect(mocks.extractJobTextMock).not.toHaveBeenCalled();
    expect(mocks.warnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://www.linkedin.com/jobs/view/1",
      }),
      "Skipping duplicate job review",
    );
    expect(mocks.createSystemLogMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        level: "WARN",
        scope: "linkedin.batch",
        message: "Skipping duplicate job review.",
      }),
    });
  });

  it("throws when no CLI args are provided", async () => {
    const { module, deps } = await loadIndexModule();

    await expect(module.main([], deps)).rejects.toThrow(
      "Usage: npm run dev -- <job-url> | npm run dev -- score",
    );
  });

  it("logs and prints a clear CLI error message before exiting", async () => {
    const { module, mocks, deps } = await loadIndexModule();
    const stderrWriteSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    await module.runCli(deps);

    expect(mocks.errorMock).toHaveBeenCalledWith(
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
    expect(mocks.exitMock).toHaveBeenCalledWith(1);
    stderrWriteSpy.mockRestore();
  });

  it("disconnects prisma after a successful CLI run", async () => {
    const { module, mocks, deps } = await loadIndexModule();
    const originalArgv = process.argv;
    process.argv = ["node", "index.js", "https://jobs.example.com/1"];

    try {
      mockWithPageSuccess(mocks.withPageMock);
      mocks.loadCandidateProfileMock.mockResolvedValue({ yearsOfExperience: 3 });
      mocks.extractJobTextMock.mockResolvedValue({
        rawText: "Raw body",
        title: "Adapter Title",
        company: "Adapter Company",
        location: "Adapter Location",
        platform: "greenhouse",
      });
      mocks.formatJobForLLMMock.mockReturnValue("Formatted prompt");
      mocks.parseJobMock.mockResolvedValue({
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
      mocks.normalizeParsedJobMock.mockReturnValue({
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
      mocks.scoreJobMock.mockReturnValue({
        totalScore: 50,
        breakdown: { skill: 10, seniority: 10, location: 10, tech: 10, bonus: 10 },
      });
      mocks.evaluatePolicyMock.mockReturnValue({ allowed: true, reasons: [] });
      mocks.decideJobMock.mockReturnValue({ decision: "MAYBE", reason: "Borderline fit." });
      mocks.upsertMock.mockResolvedValue({ id: "job_1" });
      mocks.createDecisionMock.mockResolvedValue({ id: "decision_1" });

      await module.runCli(deps);

      expect(mocks.disconnectMock).toHaveBeenCalledTimes(1);
      expect(mocks.exitMock).not.toHaveBeenCalled();
    } finally {
      process.argv = originalArgv;
    }
  });

  it("prints a terminal summary for successful batch dry runs", async () => {
    const { module, mocks, deps } = await loadIndexModule();
    const stdoutWriteSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const originalArgv = process.argv;
    process.argv = ["node", "index.js", "easy-apply-dry-run", "--count", "2"];

    try {
      mocks.loadCandidateMasterProfileMock.mockResolvedValue({
        fullName: "Jane Doe",
        linkedinUrl: "https://linkedin.com/in/jane",
        sourceMetadata: { resumePath: "./resume.txt" },
      });
      mocks.loadCandidateProfileMock.mockResolvedValue({
        yearsOfExperience: 3,
        preferredRoles: [],
        preferredTechStack: [],
        excludedRoles: [],
        preferredLocations: [],
        excludedLocations: [],
        allowedHybridLocations: ["Ankara"],
        remotePreference: "remote",
        remoteOnly: true,
        visaRequirement: "not-required",
        languages: [],
        salaryExpectation: null,
        salaryExpectations: { usd: null, eur: null, try: null },
        gpa: null,
        linkedinUrl: null,
        workAuthorizationStatus: "authorized",
        requiresSponsorship: false,
        willingToRelocate: false,
        disability: {
          hasVisualDisability: false,
          disabilityPercentage: null,
          requiresAccommodation: null,
          accommodationNotes: null,
          disclosurePreference: "manual-review",
        },
      });
      mocks.createEasyApplyDriverMock.mockReturnValue({ driver: true });
      mockWithPageSuccess(mocks.withPageMock);
      mocks.runEasyApplyBatchDryRunMock.mockResolvedValue({
        status: "completed",
        collectionUrl: "https://www.linkedin.com/jobs/collections/easy-apply",
        requestedCount: 2,
        attemptedCount: 1,
        evaluatedCount: 4,
        skippedCount: 3,
        pagesVisited: 2,
        jobs: [],
        stopReason: "Processed 1 LinkedIn Easy Apply job(s).",
      });

      await module.runCli(deps);

      expect(stdoutWriteSpy).toHaveBeenCalledWith(
        expect.stringContaining("LinkedIn Easy Apply dry run finished"),
      );
      expect(stdoutWriteSpy).toHaveBeenCalledWith(
        expect.stringContaining("Report: artifacts/batch-runs/report.json"),
      );
      expect(mocks.disconnectMock).toHaveBeenCalledTimes(1);
    } finally {
      process.argv = originalArgv;
      stdoutWriteSpy.mockRestore();
    }
  });

  it("prints a terminal summary for successful single easy-apply runs", async () => {
    const { module, mocks, deps } = await loadIndexModule();
    const stdoutWriteSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const originalArgv = process.argv;
    process.argv = ["node", "index.js", "easy-apply", "https://www.linkedin.com/jobs/view/1"];

    try {
      mocks.loadCandidateMasterProfileMock.mockResolvedValue({
        fullName: "Jane Doe",
        linkedinUrl: "https://linkedin.com/in/jane",
        sourceMetadata: { resumePath: "./resume.txt" },
      });
      mocks.createEasyApplyDriverMock.mockReturnValue({ driver: true });
      mockWithPageSuccess(mocks.withPageMock);
      mocks.runEasyApplyMock.mockResolvedValue({
        status: "ready_to_submit",
        steps: [{ action: "review" }],
        stopReason: "Reached the final submit step.",
        url: "https://www.linkedin.com/jobs/view/1",
      });

      await module.runCli(deps);

      expect(stdoutWriteSpy).toHaveBeenCalledWith(
        expect.stringContaining("LinkedIn Easy Apply finished"),
      );
      expect(stdoutWriteSpy).toHaveBeenCalledWith(
        expect.stringContaining("Reason: Reached the final submit step."),
      );
    } finally {
      process.argv = originalArgv;
      stdoutWriteSpy.mockRestore();
    }
  });

  it("wraps job analysis database save failures with a database phase error", async () => {
    const { module, mocks, deps } = await loadIndexModule();
    mockWithPageSuccess(mocks.withPageMock);
    mocks.loadCandidateProfileMock.mockResolvedValue({ yearsOfExperience: 3 });
    mocks.extractJobTextMock.mockResolvedValue({
      rawText: "Raw body",
      title: "Adapter Title",
      company: "Adapter Company",
      location: "Adapter Location",
      platform: "greenhouse",
    });
    mocks.formatJobForLLMMock.mockReturnValue("Formatted prompt");
    mocks.parseJobMock.mockResolvedValue({
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
    mocks.normalizeParsedJobMock.mockReturnValue({
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
    mocks.scoreJobMock.mockReturnValue({
      totalScore: 50,
      breakdown: { skill: 10, seniority: 10, location: 10, tech: 10, bonus: 10 },
    });
    mocks.evaluatePolicyMock.mockReturnValue({ allowed: true, reasons: [] });
    mocks.decideJobMock.mockReturnValue({ decision: "MAYBE", reason: "Borderline fit." });
    mocks.upsertMock.mockRejectedValue(new Error("sqlite busy"));

    await expect(module.main(["https://jobs.example.com/1"], deps)).rejects.toMatchObject({
      name: "AppError",
      phase: "database",
      code: "DATABASE_WRITE_FAILED",
      message: "Failed to save job analysis to the database.",
    });
  });
});
