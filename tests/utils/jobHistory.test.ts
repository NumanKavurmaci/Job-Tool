import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildDuplicateReviewReason,
  getLatestPersistedJobDecisionReview,
  getLatestJobReview,
  getLatestJobReviewsByUrl,
  recordJobReviewHistory,
  shouldRetryPendingApprovedReview,
  shouldSkipDuplicateBatchReview,
} from "../../src/utils/jobHistory.js";

describe("jobHistory", () => {
  beforeEach(() => {
    vi.stubEnv("JOB_TOOL_RUN_ID", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("persists job review history entries", async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const warn = vi.fn();

    await recordJobReviewHistory({
      prisma: {
        jobReviewHistory: { create },
      } as never,
      logger: { warn } as never,
      entry: {
        jobUrl: "https://example.com/jobs/1",
        source: "easy-apply-dry-run",
        status: "SKIPPED",
        score: 44,
        threshold: 60,
        decision: "SKIP",
        policyAllowed: false,
        reasons: ["Low fit score."],
        summary: "Low fit score.",
        details: { duplicate: false },
      },
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        jobUrl: "https://example.com/jobs/1",
        source: "easy-apply-dry-run",
        status: "SKIPPED",
        score: 44,
        threshold: 60,
        decision: "SKIP",
        policyAllowed: false,
        reasons: JSON.stringify(["Low fit score."]),
        summary: "Low fit score.",
        detailsJson: JSON.stringify({ duplicate: false }),
      },
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("merges the dashboard run id into review details", async () => {
    vi.stubEnv("JOB_TOOL_RUN_ID", "dashboard-run-123");
    const create = vi.fn().mockResolvedValue(undefined);

    await recordJobReviewHistory({
      prisma: {
        jobReviewHistory: { create },
      } as never,
      logger: { warn: vi.fn() } as never,
      entry: {
        jobUrl: "https://example.com/jobs/1",
        source: "apply-batch",
        status: "EVALUATED",
        reasons: ["Strong fit."],
        details: { dashboardRunId: "caller-value", provider: "kariyer" },
      },
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        detailsJson: JSON.stringify({
          dashboardRunId: "dashboard-run-123",
          provider: "kariyer",
        }),
      }),
    });
  });

  it("creates review details when only a dashboard run id is available", async () => {
    vi.stubEnv("JOB_TOOL_RUN_ID", "dashboard-run-456");
    const create = vi.fn().mockResolvedValue(undefined);

    await recordJobReviewHistory({
      prisma: {
        jobReviewHistory: { create },
      } as never,
      logger: { warn: vi.fn() } as never,
      entry: {
        jobUrl: "https://example.com/jobs/2",
        source: "score",
        status: "EVALUATED",
        reasons: ["Evaluated."],
      },
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        detailsJson: JSON.stringify({ dashboardRunId: "dashboard-run-456" }),
      }),
    });
  });

  it("does not fail the caller if job review history persistence fails", async () => {
    const create = vi.fn().mockRejectedValue(new Error("db down"));
    const warn = vi.fn();

    await recordJobReviewHistory({
      prisma: {
        jobReviewHistory: { create },
      } as never,
      logger: { warn } as never,
      entry: {
        jobUrl: "https://example.com/jobs/1",
        source: "decide",
        status: "EVALUATED",
        reasons: ["Strong fit."],
      },
    });

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        jobUrl: "https://example.com/jobs/1",
        source: "decide",
        status: "EVALUATED",
      }),
      "Failed to persist job review history",
    );
  });

  it("fetches the latest review by URL", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "review_1" });

    const result = await getLatestJobReview({
      prisma: {
        jobReviewHistory: { findFirst },
      } as never,
      jobUrl: "https://example.com/jobs/1",
    });

    expect(result).toEqual({ id: "review_1" });
    expect(findFirst).toHaveBeenCalledWith({
      where: { jobUrl: "https://example.com/jobs/1" },
      orderBy: [{ createdAt: "desc" }],
    });
  });

  it("fails open if latest-review lookup errors", async () => {
    const findFirst = vi.fn().mockRejectedValue(new Error("db down"));
    const warn = vi.fn();

    const result = await getLatestJobReview({
      prisma: {
        jobReviewHistory: { findFirst },
      } as never,
      jobUrl: "https://example.com/jobs/1",
      logger: { warn } as never,
    });

    expect(result).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        jobUrl: "https://example.com/jobs/1",
      }),
      "Failed to load latest job review history",
    );
  });

  it("can fail closed when latest-review verification errors", async () => {
    const findFirst = vi.fn().mockRejectedValue(new Error("db down"));

    await expect(
      getLatestJobReview({
        prisma: {
          jobReviewHistory: { findFirst },
        } as never,
        jobUrl: "https://example.com/jobs/1",
        throwOnError: true,
      }),
    ).rejects.toThrow("db down");
  });

  it("finds an older LinkedIn URL variant by its posting id", async () => {
    const review = {
      id: "review_linkedin",
      jobUrl:
        "https://www.linkedin.com/jobs/search/?currentJobId=4461044308&origin=JOB_SEARCH_PAGE",
      createdAt: new Date("2026-09-01T10:00:00.000Z"),
    };
    const findFirst = vi.fn().mockResolvedValue(null);
    const findMany = vi.fn().mockResolvedValue([review]);

    const result = await getLatestJobReview({
      prisma: {
        jobReviewHistory: { findFirst, findMany },
      } as never,
      jobUrl:
        "https://www.linkedin.com/jobs/view/4461044308/?trackingId=abc",
    });

    expect(result).toBe(review);
    expect(findMany).toHaveBeenCalledWith({
      where: { jobUrl: { contains: "4461044308" } },
      orderBy: [{ createdAt: "desc" }],
    });
  });

  it("treats a persisted application decision as a legacy review", async () => {
    const createdAt = new Date("2026-08-31T10:00:00.000Z");
    const findUnique = vi.fn().mockResolvedValue({
      id: "job_legacy",
      url: "https://www.linkedin.com/jobs/view/4461044308",
      platform: "linkedin",
      decisions: [
        {
          id: "decision_legacy",
          score: 71,
          decision: "APPLY",
          policyAllowed: true,
          reasons: JSON.stringify(["Strong fit."]),
          createdAt,
        },
      ],
    });

    const result = await getLatestPersistedJobDecisionReview({
      prisma: { jobPosting: { findUnique } } as never,
      jobUrl:
        "https://www.linkedin.com/jobs/search/?currentJobId=4461044308",
    });

    expect(result).toMatchObject({
      id: "application-decision:decision_legacy",
      jobPostingId: "job_legacy",
      status: "EVALUATED",
      decision: "APPLY",
      score: 71,
      createdAt,
    });
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          url: "https://www.linkedin.com/jobs/view/4461044308",
        },
      }),
    );
  });

  it("fetches latest reviews for many URLs with one query", async () => {
    const newer = {
      id: "review_newer",
      jobUrl: "https://example.com/jobs/1",
      createdAt: new Date("2026-04-02T10:00:00.000Z"),
    };
    const older = {
      id: "review_older",
      jobUrl: "https://example.com/jobs/1",
      createdAt: new Date("2026-04-01T10:00:00.000Z"),
    };
    const second = {
      id: "review_2",
      jobUrl: "https://example.com/jobs/2",
      createdAt: new Date("2026-04-01T10:00:00.000Z"),
    };
    const findMany = vi.fn().mockResolvedValue([newer, older, second]);

    const result = await getLatestJobReviewsByUrl({
      prisma: {
        jobReviewHistory: { findMany },
      } as never,
      jobUrls: [
        "https://example.com/jobs/1",
        "https://example.com/jobs/2",
        "https://example.com/jobs/1",
      ],
      source: "explore-batch",
    });

    expect(result.get("https://example.com/jobs/1")).toBe(newer);
    expect(result.get("https://example.com/jobs/2")).toBe(second);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          {
            jobUrl: {
              in: ["https://example.com/jobs/1", "https://example.com/jobs/2"],
            },
          },
        ],
        source: "explore-batch",
      },
      orderBy: [{ createdAt: "desc" }],
    });
  });

  it("builds a human-readable duplicate review reason", () => {
    const reason = buildDuplicateReviewReason({
      createdAt: new Date("2026-03-29T10:00:00.000Z"),
      status: "SKIPPED",
      decision: "SKIP",
      score: 47,
    } as never);

    expect(reason).toBe(
      "Job was already reviewed on 2026-03-29 with status SKIPPED, score 47, decision SKIP.",
    );
  });

  it("only treats terminal review states as duplicate batch skips", () => {
    expect(shouldSkipDuplicateBatchReview({ status: "SKIPPED" } as never)).toBe(true);
    expect(shouldSkipDuplicateBatchReview({ status: "SKIPPED_DUE_TO_EASY_APPLY_RUN" } as never)).toBe(true);
    expect(shouldSkipDuplicateBatchReview({ status: "SUBMITTED" } as never)).toBe(true);
    expect(shouldSkipDuplicateBatchReview({ status: "EVALUATED" } as never)).toBe(false);
    expect(shouldSkipDuplicateBatchReview({ status: "READY_TO_SUBMIT" } as never)).toBe(false);
    expect(shouldSkipDuplicateBatchReview({ status: "FAILED" } as never)).toBe(false);
  });

  it("retries previously approved reviews until they are actually submitted", () => {
    expect(
      shouldRetryPendingApprovedReview({ status: "EVALUATED", decision: "APPLY" } as never),
    ).toBe(true);
    expect(
      shouldRetryPendingApprovedReview({ status: "READY_TO_SUBMIT", decision: "APPLY" } as never),
    ).toBe(true);
    expect(
      shouldRetryPendingApprovedReview({ status: "FAILED", decision: "APPLY" } as never),
    ).toBe(true);
    expect(
      shouldRetryPendingApprovedReview({ status: "SUBMITTED", decision: "APPLY" } as never),
    ).toBe(false);
    expect(
      shouldRetryPendingApprovedReview({ status: "SKIPPED", decision: "SKIP" } as never),
    ).toBe(false);
  });
});
