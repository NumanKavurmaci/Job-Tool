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
  const resolveAnswerMock = vi.fn();
  const withPageMock = vi.fn();
  const runEasyApplyDryRunMock = vi.fn();
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
      resolveAnswerMock,
      withPageMock,
      runEasyApplyDryRunMock,
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
      resolveAnswer: resolveAnswerMock,
      withPage: withPageMock,
      runEasyApplyDryRun: runEasyApplyDryRunMock,
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
      });

    expect(module.parseCliArgs(["easy-apply-dry-run"])).toEqual({
      mode: "easy-apply-dry-run",
      url: "https://www.linkedin.com/jobs/collections/easy-apply",
      resumePath: expect.any(String),
    });
  });

  it("rejects missing candidate prep flags", async () => {
    const { module } = await loadIndexModule();

    expect(() => module.parseCliArgs(["answer-questions", "--resume", "./resume.txt"])).toThrow(
      "--questions is required",
    );
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
    mocks.createEasyApplyDriverMock.mockReturnValue({ driver: true });
    mocks.withPageMock.mockImplementation(async (fn: (page: unknown) => Promise<unknown>) =>
      fn({ fake: "page" }),
    );
    mocks.runEasyApplyDryRunMock.mockResolvedValue({
      status: "ready_to_submit",
      steps: [],
      stopReason: "Reached the final submit step. Dry run stops before submission.",
      url: "https://www.linkedin.com/jobs/view/1",
    });

    const result = await module.main(
      ["easy-apply-dry-run", "https://www.linkedin.com/jobs/view/1", "--resume", "./resume.txt"],
      deps,
    );

    expect(result.easyApply.status).toBe("ready_to_submit");
    expect(mocks.createEasyApplyDriverMock).toHaveBeenCalled();
    expect(mocks.runEasyApplyDryRunMock).toHaveBeenCalled();
    expect(mocks.infoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "ready_to_submit",
        stepCount: 0,
      }),
      "LinkedIn Easy Apply dry run finished",
    );
  });

  it("wraps easy apply flow failures with a linkedin phase error", async () => {
    const { module, mocks, deps } = await loadIndexModule();
    mocks.loadCandidateMasterProfileMock.mockResolvedValue({
      fullName: "Jane Doe",
      linkedinUrl: "https://linkedin.com/in/jane",
      sourceMetadata: { resumePath: "./resume.txt" },
    });
    mocks.createEasyApplyDriverMock.mockReturnValue({ driver: true });
    mocks.withPageMock.mockImplementation(async (fn: (page: unknown) => Promise<unknown>) =>
      fn({ fake: "page" }),
    );
    mocks.runEasyApplyDryRunMock.mockRejectedValue(new Error("login wall"));

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
