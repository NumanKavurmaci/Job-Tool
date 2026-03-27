import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadIndexModule(readFileMock?: ReturnType<typeof vi.fn>) {
  vi.resetModules();

  if (readFileMock) {
    vi.doMock("node:fs/promises", () => ({
      readFile: readFileMock,
    }));
  }

  const module = await import("../../src/index.js");
  const getConfiguredProviderInfoMock = vi.fn(() => ({
    provider: "local",
    model: "openai/gpt-oss-20b",
  }));
  const loadCandidateMasterProfileMock = vi.fn();
  const loadCandidateProfileMock = vi.fn();
  const resolveAnswerMock = vi.fn();
  const withPageMock = vi.fn();
  const runEasyApplyMock = vi.fn();
  const runEasyApplyDryRunMock = vi.fn();
  const runEasyApplyBatchDryRunMock = vi.fn();
  const createEasyApplyDriverMock = vi.fn();
  const createSnapshotMock = vi.fn();
  const createPreparedAnswerSetMock = vi.fn();
  const disconnectMock = vi.fn();
  const infoMock = vi.fn();
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
      runEasyApplyMock,
      runEasyApplyDryRunMock,
      runEasyApplyBatchDryRunMock,
      createEasyApplyDriverMock,
      createSnapshotMock,
      createPreparedAnswerSetMock,
      disconnectMock,
      infoMock,
      errorMock,
      exitMock,
    },
    deps: {
      getConfiguredProviderInfo: getConfiguredProviderInfoMock,
      loadCandidateMasterProfile: loadCandidateMasterProfileMock,
      loadCandidateProfile: loadCandidateProfileMock,
      resolveAnswer: resolveAnswerMock,
      withPage: withPageMock,
      runEasyApply: runEasyApplyMock,
      runEasyApplyDryRun: runEasyApplyDryRunMock,
      runEasyApplyBatchDryRun: runEasyApplyBatchDryRunMock,
      createEasyApplyDriver: createEasyApplyDriverMock,
      prisma: {
        candidateProfileSnapshot: { create: createSnapshotMock },
        preparedAnswerSet: { create: createPreparedAnswerSetMock },
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

function mockWithPageSuccess(mock: ReturnType<typeof vi.fn>) {
  mock.mockImplementation(
    async (
      optionsOrFn: unknown,
      maybeFn?: (page: unknown) => Promise<unknown>,
    ) => {
      const fn = typeof optionsOrFn === "function" ? optionsOrFn : maybeFn;
      return fn?.({ fake: "page" });
    },
  );
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
      });

    expect(module.parseCliArgs(["easy-apply-dry-run"])).toEqual({
      mode: "easy-apply-dry-run",
      url: "https://www.linkedin.com/jobs/collections/easy-apply",
      resumePath: expect.any(String),
      count: 1,
    });

    expect(module.parseCliArgs(["easy-apply-dry-run", "--count", "3"])).toEqual({
      mode: "easy-apply-dry-run",
      url: "https://www.linkedin.com/jobs/collections/easy-apply",
      resumePath: expect.any(String),
      count: 3,
    });

    expect(module.parseCliArgs(["easy-apply-dry-run", "2"])).toEqual({
      mode: "easy-apply-dry-run",
      url: "https://www.linkedin.com/jobs/collections/easy-apply",
      resumePath: expect.any(String),
      count: 2,
    });

    expect(module.parseCliArgs(["easy-apply", "https://www.linkedin.com/jobs/view/1"])).toEqual({
      mode: "easy-apply",
      url: "https://www.linkedin.com/jobs/view/1",
      resumePath: expect.any(String),
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
    mockWithPageSuccess(mocks.withPageMock);
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
  });

  it("wraps real easy apply flow failures with a linkedin phase error", async () => {
    const { module, mocks, deps } = await loadIndexModule();
    mocks.loadCandidateMasterProfileMock.mockResolvedValue({
      fullName: "Jane Doe",
      linkedinUrl: "https://linkedin.com/in/jane",
      sourceMetadata: { resumePath: "./resume.txt" },
    });
    mocks.createEasyApplyDriverMock.mockReturnValue({ driver: true });
    mockWithPageSuccess(mocks.withPageMock);
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
    expect(mocks.runEasyApplyBatchDryRunMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://www.linkedin.com/jobs/collections/easy-apply",
        targetCount: 3,
      }),
    );
    expect(mocks.runEasyApplyDryRunMock).not.toHaveBeenCalled();
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
    mockWithPageSuccess(mocks.withPageMock);
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
    deps.decideJob = vi.fn().mockReturnValue({ decision: "APPLY", reason: "Strong fit." });

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
      reason: "Strong fit.",
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
    expect(mocks.withPageMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        persistentProfilePath: ".auth/linkedin-profile",
        storageStatePath: ".auth/linkedin-session.json",
        persistStorageState: true,
      }),
      expect.any(Function),
    );
    expect(mocks.withPageMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        storageStatePath: ".auth/linkedin-session.json",
        persistStorageState: true,
      }),
      expect.any(Function),
    );
    expect(mocks.withPageMock.mock.calls[1]?.[0]).not.toHaveProperty("persistentProfilePath");
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
});
