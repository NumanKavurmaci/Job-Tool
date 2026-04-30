import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../../src/app/cli.js";
import { vi } from "vitest";

describe("app cli", () => {
  it("parses score and explicit decide commands", () => {
    expect(parseCliArgs(["score", "https://example.com/job"])).toEqual({
      mode: "score",
      url: "https://example.com/job",
      useAiScoreAdjustment: false,
    });
    expect(parseCliArgs(["decide", "https://example.com/job"])).toEqual({
      mode: "decide",
      url: "https://example.com/job",
      useAiScoreAdjustment: false,
    });
    expect(parseCliArgs(["explore", "https://example.com/job"])).toEqual({
      mode: "explore",
      url: "https://example.com/job",
      useAiScoreAdjustment: false,
    });
  });

  it("defaults a bare URL to decide mode", () => {
    expect(parseCliArgs(["https://example.com/job"])).toEqual({
      mode: "decide",
      url: "https://example.com/job",
      useAiScoreAdjustment: false,
    });
  });

  it("parses the optional AI score adjustment flag", () => {
    expect(parseCliArgs(["decide", "https://example.com/job", "--ai-score-adjustment"])).toEqual({
      mode: "decide",
      url: "https://example.com/job",
      useAiScoreAdjustment: true,
    });
    expect(parseCliArgs(["easy-apply", "--dry-run", "--ai-score-adjustment"])).toEqual({
      mode: "easy-apply-batch",
      url: "https://www.linkedin.com/jobs/collections/easy-apply",
      resumePath: expect.any(String),
      count: 1,
      disableAiEvaluation: false,
      scoreThreshold: 40,
      useAiScoreAdjustment: true,
      dryRun: true,
    });
  });

  it("throws resume-required errors when no default resume path is available", async () => {
    vi.resetModules();
    vi.doMock("../../src/app/constants.js", async () => {
      const actual = await vi.importActual<typeof import("../../src/app/constants.js")>(
        "../../src/app/constants.js",
      );
      return {
        ...actual,
        DEFAULT_RESUME_PATH: undefined,
      };
    });

    const { parseCliArgs: parseWithNoDefaultResume } = await import("../../src/app/cli.js");

    expect(() => parseWithNoDefaultResume(["build-profile"])).toThrow(
      "--resume is required for build-profile.",
    );
    expect(() => parseWithNoDefaultResume(["answer-questions", "--questions", "./q.json"])).toThrow(
      "--resume is required for answer-questions.",
    );
    expect(() => parseWithNoDefaultResume(["easy-apply", "--dry-run"])).toThrow(
      "--resume is required for easy-apply --dry-run when no default CV is available.",
    );
    expect(() => parseWithNoDefaultResume(["easy-apply", "https://www.linkedin.com/jobs/view/1"])).toThrow(
      "--resume is required for easy-apply when no default CV is available.",
    );
    expect(() => parseWithNoDefaultResume(["easy-apply-batch"])).toThrow(
      "--resume is required for easy-apply-batch when no default CV is available.",
    );
  });

  it("ignores empty positional slots while parsing tail arguments", () => {
    expect(
      parseCliArgs(["easy-apply", "--dry-run", undefined as unknown as string, "2"]),
    ).toEqual({
      mode: "easy-apply-batch",
      url: "https://www.linkedin.com/jobs/collections/easy-apply",
      resumePath: expect.any(String),
      count: 2,
      disableAiEvaluation: false,
      scoreThreshold: 40,
      useAiScoreAdjustment: false,
      dryRun: true,
    });
  });

  it("parses external application dry-run commands", () => {
    expect(parseCliArgs(["external-apply", "https://tally.so/r/31yWVM", "--dry-run"])).toEqual({
      mode: "external-apply",
      url: "https://tally.so/r/31yWVM",
      resumePath: expect.any(String),
      dryRun: true,
    });
    expect(parseCliArgs(["external-apply-dry-run", "https://tally.so/r/31yWVM"])).toEqual({
      mode: "external-apply",
      url: "https://tally.so/r/31yWVM",
      resumePath: expect.any(String),
      dryRun: true,
    });
  });

  it("parses explicit batch commands for LinkedIn apply flows", () => {
    expect(
      parseCliArgs([
        "apply-batch",
        "https://www.linkedin.com/jobs/collections/top-applicant",
        "--count",
        "3",
        "--score-threshold",
        "55",
        "--disable-ai-evaluation",
      ]),
    ).toEqual({
      mode: "apply-batch",
      url: "https://www.linkedin.com/jobs/collections/top-applicant",
      resumePath: expect.any(String),
      count: 3,
      disableAiEvaluation: true,
      scoreThreshold: 55,
      useAiScoreAdjustment: false,
      dryRun: false,
    });
  });

  it("parses explore batch commands without any apply or resume arguments", () => {
    expect(
      parseCliArgs([
        "explore-batch",
        "https://www.linkedin.com/jobs/collections/top-applicant",
        "--count",
        "7",
        "--score-threshold",
        "65",
        "--disable-ai-evaluation",
        "--ai-score-adjustment",
      ]),
    ).toEqual({
      mode: "explore-batch",
      url: "https://www.linkedin.com/jobs/collections/top-applicant",
      count: 7,
      disableAiEvaluation: true,
      scoreThreshold: 65,
      useAiScoreAdjustment: true,
    });
  });

  it("parses LinkedIn apply commands separately from easy-apply", () => {
    expect(parseCliArgs(["apply", "https://www.linkedin.com/jobs/view/1", "--dry-run"])).toEqual({
      mode: "apply",
      url: "https://www.linkedin.com/jobs/view/1",
      resumePath: expect.any(String),
      dryRun: true,
    });

    expect(parseCliArgs(["apply-dry-run", "--count", "2"])).toEqual({
      mode: "apply-batch",
      url: "https://www.linkedin.com/jobs/collections/easy-apply",
      resumePath: expect.any(String),
      count: 2,
      disableAiEvaluation: false,
      scoreThreshold: 40,
      useAiScoreAdjustment: false,
      dryRun: true,
    });
  });

  it("treats collection links with currentJobId as single LinkedIn job URLs for single-job apply flows", () => {
    expect(parseCliArgs([
      "easy-apply-dry-run",
      "https://www.linkedin.com/jobs/collections/top-applicant/?currentJobId=4387565844",
    ])).toEqual({
      mode: "easy-apply",
      url: "https://www.linkedin.com/jobs/view/4387565844/",
      resumePath: expect.any(String),
      dryRun: true,
    });

    expect(parseCliArgs([
      "easy-apply",
      "https://www.linkedin.com/jobs/collections/top-applicant/?currentJobId=4387565844",
    ])).toEqual({
      mode: "easy-apply",
      url: "https://www.linkedin.com/jobs/view/4387565844/",
      resumePath: expect.any(String),
      dryRun: false,
    });
  });

  it("rejects missing or invalid URLs for explicit apply commands", () => {
    expect(() => parseCliArgs(["external-apply"])).toThrow("--url is required for external-apply.");
    expect(() => parseCliArgs(["apply-batch", "https://www.linkedin.com/jobs/view/1"])).toThrow(
      "apply-batch requires a LinkedIn collection URL or the default collection.",
    );
    expect(() =>
      parseCliArgs(["easy-apply-batch", "https://www.linkedin.com/jobs/view/1"]),
    ).toThrow("easy-apply-batch requires a LinkedIn collection URL or the default collection.");
    expect(() =>
      parseCliArgs(["explore-batch", "https://www.linkedin.com/jobs/view/1"]),
    ).toThrow("explore-batch requires a LinkedIn collection URL or the default collection.");
  });
});
