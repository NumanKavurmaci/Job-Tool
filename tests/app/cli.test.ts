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
    expect(parseCliArgs(["easy-apply-dry-run", "--ai-score-adjustment"])).toEqual({
      mode: "easy-apply-dry-run",
      url: "https://www.linkedin.com/jobs/collections/easy-apply",
      resumePath: expect.any(String),
      count: 1,
      disableAiEvaluation: false,
      scoreThreshold: 40,
      useAiScoreAdjustment: true,
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
    expect(() => parseWithNoDefaultResume(["easy-apply-dry-run"])).toThrow(
      "--resume is required for easy-apply-dry-run when no default CV is available.",
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
      parseCliArgs(["easy-apply-dry-run", undefined as unknown as string, "2"]),
    ).toEqual({
      mode: "easy-apply-dry-run",
      url: "https://www.linkedin.com/jobs/collections/easy-apply",
      resumePath: expect.any(String),
      count: 2,
      disableAiEvaluation: false,
      scoreThreshold: 40,
      useAiScoreAdjustment: false,
    });
  });
});
