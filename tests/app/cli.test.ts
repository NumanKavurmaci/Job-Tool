import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../../src/app/cli.js";
import { vi } from "vitest";

describe("app cli", () => {
  it("parses score and explicit decide commands", () => {
    expect(parseCliArgs(["score", "https://example.com/job"])).toEqual({
      mode: "score",
      url: "https://example.com/job",
      scoringMode: "local",
    });
    expect(parseCliArgs(["decide", "https://example.com/job"])).toEqual({
      mode: "decide",
      url: "https://example.com/job",
      scoringMode: "local",
    });
    expect(parseCliArgs(["explore", "https://example.com/job"])).toEqual({
      mode: "explore",
      url: "https://example.com/job",
      scoringMode: "local",
    });
    expect(parseCliArgs(["dashboard"])).toEqual({
      mode: "dashboard",
      limit: 5,
    });
    expect(parseCliArgs(["dashboard", "--limit", "8"])).toEqual({
      mode: "dashboard",
      limit: 8,
    });
  });

  it("defaults a bare URL to decide mode", () => {
    expect(parseCliArgs(["https://example.com/job"])).toEqual({
      mode: "decide",
      url: "https://example.com/job",
      scoringMode: "local",
    });
  });

  it("parses AI scoring mode flags", () => {
    expect(parseCliArgs(["decide", "https://example.com/job", "--ai-score-adjustment"])).toEqual({
      mode: "decide",
      url: "https://example.com/job",
      scoringMode: "ai",
    });
    expect(parseCliArgs(["decide", "https://example.com/job", "--scoring", "ai"])).toEqual({
      mode: "decide",
      url: "https://example.com/job",
      scoringMode: "ai",
    });
    expect(parseCliArgs(["easy-apply", "--dry-run", "--ai-score-adjustment"])).toEqual({
      mode: "easy-apply-batch",
      url: "https://www.linkedin.com/jobs/collections/easy-apply",
      resumePath: expect.any(String),
      count: 1,
      disableAiEvaluation: false,
      scoreThreshold: 40,
      scoringMode: "ai",
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
      scoringMode: "local",
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
      scoringMode: "local",
      dryRun: false,
    });
  });

  it("parses ReactJobs result pages as apply batches", () => {
    expect(
      parseCliArgs([
        "apply-batch",
        "https://reactjobs.io/jobs/nextjs/remote?search=Nextjs&isRemote=true",
        "--count",
        "5",
        "--scoring",
        "ai",
      ]),
    ).toEqual({
      mode: "apply-batch",
      url: "https://reactjobs.io/jobs/nextjs/remote?search=Nextjs&isRemote=true",
      resumePath: expect.any(String),
      count: 5,
      disableAiEvaluation: false,
      scoreThreshold: 40,
      scoringMode: "ai",
      dryRun: false,
    });
  });

  it("parses Ashby listing pages as apply batches", () => {
    expect(
      parseCliArgs([
        "apply-batch",
        "https://jobs.ashbyhq.com/ruby-labs?workplaceType=Remote",
        "--count",
        "2",
      ]),
    ).toEqual({
      mode: "apply-batch",
      url: "https://jobs.ashbyhq.com/ruby-labs?workplaceType=Remote",
      resumePath: expect.any(String),
      count: 2,
      disableAiEvaluation: false,
      scoreThreshold: 40,
      scoringMode: "local",
      dryRun: false,
    });
  });

  it("parses Kariyer.net listing pages as apply batches", () => {
    const url =
      "https://www.kariyer.net/is-ilanlari/yazilim+gelistirme+uzmani?pst=3193&pkw=yaz%C4%B1l%C4%B1m%20geli%C5%9Ftirme%20uzman%C4%B1";

    expect(
      parseCliArgs([
        "apply-batch",
        url,
        "--count",
        "4",
        "--dry-run",
      ]),
    ).toEqual({
      mode: "apply-batch",
      url,
      resumePath: expect.any(String),
      count: 4,
      disableAiEvaluation: false,
      scoreThreshold: 40,
      scoringMode: "local",
      dryRun: true,
    });
  });

  it("treats implicit Kariyer.net apply dry runs as apply batches", () => {
    const url = "https://www.kariyer.net/is-ilanlari/yazilim+uzmani?cp=2";

    expect(parseCliArgs(["apply-dry-run", url])).toEqual({
      mode: "apply-batch",
      url,
      resumePath: expect.any(String),
      count: 1,
      disableAiEvaluation: false,
      scoreThreshold: 40,
      scoringMode: "local",
      dryRun: true,
    });
  });

  it("treats apply dry runs for Ashby listing pages as apply batches", () => {
    expect(
      parseCliArgs([
        "apply-dry-run",
        "https://jobs.ashbyhq.com/ruby-labs?workplaceType=Remote",
        "--count",
        "1",
      ]),
    ).toEqual({
      mode: "apply-batch",
      url: "https://jobs.ashbyhq.com/ruby-labs?workplaceType=Remote",
      resumePath: expect.any(String),
      count: 1,
      disableAiEvaluation: false,
      scoreThreshold: 40,
      scoringMode: "local",
      dryRun: true,
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
      scoringMode: "ai",
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
      scoringMode: "local",
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

  it("accepts LinkedIn search-results URLs for batch commands", () => {
    const url =
      "https://www.linkedin.com/jobs/search-results/?keywords=full-time%20Software%20Engineer%20or%20Software%20Specialist%2C%20remote&origin=PREFERENCES_LANDING&originToLandingJobPostings=4443235445%2C4444570774%2C4444155287&geoId=102105699";

    expect(parseCliArgs(["easy-apply-batch", url])).toMatchObject({
      mode: "easy-apply-batch",
      url,
    });
  });

  it("accepts LinkedIn jobs/search URLs for batch dry runs while preserving their query", () => {
    const url =
      "https://www.linkedin.com/jobs/search/?currentJobId=4453632216&geoId=102105699&keywords=yaz%C4%B1l%C4%B1m&origin=JOB_SEARCH_PAGE_SEARCH_BUTTON&refresh=true";

    expect(
      parseCliArgs([
        "apply-batch",
        url,
        "--count",
        "1",
        "--dry-run",
        "--scoring",
        "ai",
      ]),
    ).toMatchObject({
      mode: "apply-batch",
      url,
      count: 1,
      dryRun: true,
      scoringMode: "ai",
    });
    expect(
      parseCliArgs(["explore-batch", url, "--count", "1", "--scoring", "ai"]),
    ).toMatchObject({
      mode: "explore-batch",
      url,
      count: 1,
      scoringMode: "ai",
    });
  });

  it("rejects missing or invalid URLs for explicit apply commands", () => {
    expect(() => parseCliArgs(["external-apply"])).toThrow("--url is required for external-apply.");
    expect(() => parseCliArgs(["apply-batch", "https://www.linkedin.com/jobs/view/1"])).toThrow(
      "apply-batch requires a supported listing URL (LinkedIn collection/search-results, ReactJobs, Ashby, or Kariyer.net).",
    );
    expect(() =>
      parseCliArgs(["easy-apply-batch", "https://www.linkedin.com/jobs/view/1"]),
    ).toThrow(
      "easy-apply-batch requires a LinkedIn collection or search-results URL, or the default collection.",
    );
    expect(() =>
      parseCliArgs(["explore-batch", "https://www.linkedin.com/jobs/view/1"]),
    ).toThrow(
      "explore-batch requires a LinkedIn collection or search-results URL, or the default collection.",
    );
  });

  it("rejects unsafe single URLs before any browser flow can start", () => {
    expect(() => parseCliArgs(["score", "file:///etc/passwd"])).toThrow(
      "unsupported_protocol",
    );
    expect(() => parseCliArgs(["http://127.0.0.1:3000/admin"])).toThrow("private_host");
    expect(() =>
      parseCliArgs([
        "external-apply",
        "https://user:secret@apply.example.com/form",
        "--resume",
        "./cv.pdf",
      ]),
    ).toThrow("embedded_credentials");
    expect(() =>
      parseCliArgs([
        "external-apply",
        "http://apply.example.com/form",
        "--resume",
        "./cv.pdf",
      ]),
    ).toThrow("unsupported_protocol");
  });

  it("requires genuine HTTPS LinkedIn hosts for LinkedIn commands", () => {
    expect(() =>
      parseCliArgs([
        "apply",
        "https://linkedin.com.evil.test/jobs/view/1",
        "--resume",
        "./cv.pdf",
      ]),
    ).toThrow("disallowed_host");
    expect(() =>
      parseCliArgs([
        "easy-apply",
        "http://www.linkedin.com/jobs/view/1",
        "--resume",
        "./cv.pdf",
      ]),
    ).toThrow("unsupported_protocol");
  });

  it("does not accept a ReactJobs path embedded in an attacker host", () => {
    expect(() =>
      parseCliArgs([
        "apply-batch",
        "https://evil.test/reactjobs.io/jobs/nextjs/remote",
        "--count",
        "2",
        "--resume",
        "./cv.pdf",
      ]),
    ).toThrow(
      "apply-batch requires a supported listing URL (LinkedIn collection/search-results, ReactJobs, Ashby, or Kariyer.net).",
    );
  });

  it("does not accept a Kariyer.net listing path embedded in an attacker host", () => {
    expect(() =>
      parseCliArgs([
        "apply-batch",
        "https://kariyer.net.evil.test/is-ilanlari/yazilim+uzmani",
        "--count",
        "2",
        "--resume",
        "./cv.pdf",
      ]),
    ).toThrow(
      "apply-batch requires a supported listing URL (LinkedIn collection/search-results, ReactJobs, Ashby, or Kariyer.net).",
    );
  });
});
