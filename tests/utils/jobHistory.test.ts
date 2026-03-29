import { describe, expect, it, vi } from "vitest";
import {
  buildDuplicateReviewReason,
  getLatestJobReview,
  recordJobReviewHistory,
} from "../../src/utils/jobHistory.js";

describe("jobHistory", () => {
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
});
