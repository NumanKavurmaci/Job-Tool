import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppDeps } from "../../../src/app/deps.js";

function createDeps(): AppDeps {
  const scoreJob = vi.fn();
  const scoreJobWithAi = vi.fn().mockImplementation(async (...args) => scoreJob(...args));

  return {
    getConfiguredProviderInfo: vi.fn(),
    loadCandidateMasterProfile: vi.fn(),
    resolveAnswer: vi.fn(),
    withPage: vi.fn(),
    extractJobText: vi.fn(),
    formatJobForLLM: vi.fn(),
    parseJob: vi.fn(),
    completePrompt: vi.fn(),
    normalizeParsedJob: vi.fn(),
    loadCandidateProfile: vi.fn(),
    scoreJob,
    scoreJobWithAi,
    evaluatePolicy: vi.fn(),
    decideJob: vi.fn(),
    runEasyApplyDryRun: vi.fn(),
    runEasyApply: vi.fn(),
    runEasyApplyBatch: vi.fn(),
    runEasyApplyBatchDryRun: vi.fn(),
    createEasyApplyDriver: vi.fn(),
    writeRunReport: vi.fn(),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any,
    prisma: {
      candidateProfileSnapshot: { create: vi.fn() },
      preparedAnswerSet: { create: vi.fn() },
      systemLog: { create: vi.fn().mockResolvedValue({}) },
    } as any,
    exit: vi.fn(),
  } as AppDeps;
}

describe("profile flows", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("builds a profile snapshot and writes a report", async () => {
    const deps = createDeps();
    (deps.loadCandidateMasterProfile as any).mockResolvedValue({
      fullName: "Jane Doe",
      linkedinUrl: "https://linkedin.com/in/jane",
      sourceMetadata: { resumePath: "./resume.pdf" },
    });
    (deps.prisma.candidateProfileSnapshot.create as any).mockResolvedValue({ id: "snapshot_1" });
    (deps.writeRunReport as any).mockResolvedValue("artifacts/profile-runs/build-profile.json");

    const { runBuildProfileFlow } = await import("../../../src/app/flows/profileFlows.js");
    const result = await runBuildProfileFlow(
      {
        mode: "build-profile",
        resumePath: "./resume.pdf",
        linkedinUrl: "https://linkedin.com/in/jane",
      },
      deps,
    );

    expect(result.reportPath).toBe("artifacts/profile-runs/build-profile.json");
    expect(deps.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ candidateProfileSnapshotId: "snapshot_1" }),
      "Candidate profile snapshot saved",
    );
  });

  it("normalizes missing resume paths to null when saving snapshots", async () => {
    const deps = createDeps();
    (deps.loadCandidateMasterProfile as any).mockResolvedValue({
      fullName: "Jane Doe",
      linkedinUrl: null,
      sourceMetadata: { resumePath: undefined },
    });
    (deps.prisma.candidateProfileSnapshot.create as any).mockResolvedValue({ id: "snapshot_1" });
    (deps.writeRunReport as any).mockResolvedValue("artifacts/profile-runs/build-profile.json");

    const { runBuildProfileFlow } = await import("../../../src/app/flows/profileFlows.js");
    await runBuildProfileFlow(
      {
        mode: "build-profile",
        resumePath: "./resume.pdf",
      },
      deps,
    );

    expect(deps.prisma.candidateProfileSnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        linkedinUrl: null,
        resumePath: null,
      }),
    });
  });

  it("wraps candidate snapshot persistence failures", async () => {
    const deps = createDeps();
    (deps.loadCandidateMasterProfile as any).mockResolvedValue({
      fullName: "Jane Doe",
      linkedinUrl: null,
      sourceMetadata: { resumePath: "./resume.pdf" },
    });
    (deps.prisma.candidateProfileSnapshot.create as any).mockRejectedValue(new Error("sqlite busy"));

    const { runBuildProfileFlow } = await import("../../../src/app/flows/profileFlows.js");

    await expect(
      runBuildProfileFlow({ mode: "build-profile", resumePath: "./resume.pdf" }, deps),
    ).rejects.toMatchObject({
      phase: "database",
      code: "DATABASE_CANDIDATE_SNAPSHOT_FAILED",
    });
  });

  it("answers questions, saves prepared answers, and writes a report", async () => {
    vi.resetModules();
    const readFileMock = vi.fn().mockResolvedValue(
      JSON.stringify([{ label: "Q1", inputType: "text" }]),
    );
    vi.doMock("node:fs/promises", () => ({ readFile: readFileMock }));
    const deps = createDeps();
    (deps.loadCandidateMasterProfile as any).mockResolvedValue({
      fullName: "Jane Doe",
      linkedinUrl: "https://linkedin.com/in/jane",
      sourceMetadata: { resumePath: "./resume.pdf" },
    });
    (deps.prisma.candidateProfileSnapshot.create as any).mockResolvedValue({ id: "snapshot_1" });
    (deps.resolveAnswer as any).mockResolvedValue({ answer: "A1" });
    (deps.prisma.preparedAnswerSet.create as any).mockResolvedValue({ id: "answers_1" });
    (deps.writeRunReport as any).mockResolvedValue(
      "artifacts/answer-runs/answer-questions.json",
    );

    const { runAnswerQuestionsFlow } = await import("../../../src/app/flows/profileFlows.js");
    const result = await runAnswerQuestionsFlow(
      {
        mode: "answer-questions",
        resumePath: "./resume.pdf",
        questionsPath: "./questions.json",
      },
      deps,
    );

    expect(result.reportPath).toBe("artifacts/answer-runs/answer-questions.json");
    expect(readFileMock).toHaveBeenCalledWith("./questions.json", "utf8");
    expect(deps.prisma.preparedAnswerSet.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        candidateProfileId: "snapshot_1",
      }),
    });
  });

  it("normalizes missing resume paths to null in answer-questions snapshots", async () => {
    vi.resetModules();
    const readFileMock = vi.fn().mockResolvedValue(JSON.stringify([]));
    vi.doMock("node:fs/promises", () => ({ readFile: readFileMock }));
    const deps = createDeps();
    (deps.loadCandidateMasterProfile as any).mockResolvedValue({
      fullName: "Jane Doe",
      linkedinUrl: null,
      sourceMetadata: { resumePath: undefined },
    });
    (deps.prisma.candidateProfileSnapshot.create as any).mockResolvedValue({ id: "snapshot_1" });
    (deps.prisma.preparedAnswerSet.create as any).mockResolvedValue({ id: "answers_1" });
    (deps.writeRunReport as any).mockResolvedValue("artifacts/answer-runs/answer-questions.json");

    const { runAnswerQuestionsFlow } = await import("../../../src/app/flows/profileFlows.js");
    await runAnswerQuestionsFlow(
      {
        mode: "answer-questions",
        resumePath: "./resume.pdf",
        questionsPath: "./questions.json",
      },
      deps,
    );

    expect(deps.prisma.candidateProfileSnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        linkedinUrl: null,
        resumePath: null,
      }),
    });
  });

  it("wraps prepared answers persistence failures", async () => {
    vi.resetModules();
    const readFileMock = vi.fn().mockResolvedValue(
      JSON.stringify([{ label: "Q1", inputType: "text" }]),
    );
    vi.doMock("node:fs/promises", () => ({ readFile: readFileMock }));
    const deps = createDeps();
    (deps.loadCandidateMasterProfile as any).mockResolvedValue({
      fullName: "Jane Doe",
      linkedinUrl: "https://linkedin.com/in/jane",
      sourceMetadata: { resumePath: "./resume.pdf" },
    });
    (deps.prisma.candidateProfileSnapshot.create as any).mockResolvedValue({ id: "snapshot_1" });
    (deps.resolveAnswer as any).mockResolvedValue({ answer: "A1" });
    (deps.prisma.preparedAnswerSet.create as any).mockRejectedValue(new Error("sqlite busy"));

    const { runAnswerQuestionsFlow } = await import("../../../src/app/flows/profileFlows.js");

    await expect(
      runAnswerQuestionsFlow(
        {
          mode: "answer-questions",
          resumePath: "./resume.pdf",
          questionsPath: "./questions.json",
        },
        deps,
      ),
    ).rejects.toMatchObject({
      phase: "database",
      code: "DATABASE_PREPARED_ANSWERS_FAILED",
    });
  });

  it("wraps snapshot persistence failures in the answer-questions flow", async () => {
    vi.resetModules();
    const readFileMock = vi.fn().mockResolvedValue("[]");
    vi.doMock("node:fs/promises", () => ({ readFile: readFileMock }));
    const deps = createDeps();
    (deps.loadCandidateMasterProfile as any).mockResolvedValue({
      fullName: "Jane Doe",
      linkedinUrl: "https://linkedin.com/in/jane",
      sourceMetadata: { resumePath: "./resume.pdf" },
    });
    (deps.prisma.candidateProfileSnapshot.create as any).mockRejectedValue(new Error("sqlite busy"));

    const { runAnswerQuestionsFlow } = await import("../../../src/app/flows/profileFlows.js");

    await expect(
      runAnswerQuestionsFlow(
        {
          mode: "answer-questions",
          resumePath: "./resume.pdf",
          questionsPath: "./questions.json",
        },
        deps,
      ),
    ).rejects.toMatchObject({
      phase: "database",
      code: "DATABASE_CANDIDATE_SNAPSHOT_FAILED",
    });
    expect(readFileMock).not.toHaveBeenCalled();
  });
});
