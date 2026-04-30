import { describe, expect, it, vi } from "vitest";
import {
  formatDashboardSummary,
  loadDashboardSnapshot,
} from "../../src/dashboard/loadDashboardSnapshot.js";

function createPrismaMocks() {
  return {
    jobPosting: {
      count: vi.fn().mockResolvedValue(14),
    },
    jobRecommendation: {
      count: vi
        .fn()
        .mockResolvedValueOnce(6)
        .mockResolvedValueOnce(4),
      findMany: vi.fn().mockResolvedValue([
        {
          source: "apply-batch",
          score: 72,
          decision: "APPLY",
          policyAllowed: true,
          summary: "Strong TypeScript and React fit.",
          recommendationStatus: "RECOMMENDED",
          updatedAt: new Date("2026-04-30T09:30:00.000Z"),
          jobPosting: {
            url: "https://www.linkedin.com/jobs/view/1",
            title: "Full-Stack Engineer",
            company: "Acme",
            location: "Remote",
            platform: "linkedin",
          },
        },
      ]),
    },
    jobReviewHistory: {
      count: vi
        .fn()
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1),
      findMany: vi.fn().mockResolvedValue([
        {
          jobUrl: "https://www.linkedin.com/jobs/view/2",
          status: "SUBMITTED",
          source: "apply-batch",
          score: 68,
          decision: "APPLY",
          summary: "Submitted successfully.",
          createdAt: new Date("2026-04-30T08:45:00.000Z"),
        },
      ]),
    },
    firm: {
      findMany: vi.fn().mockResolvedValue([
        {
          name: "Acme",
          totalReviewedJobs: 5,
          appliedJobs: 2,
          skippedJobs: 2,
          logoUrl: null,
          linkedinUrl: "https://www.linkedin.com/company/acme/",
        },
      ]),
    },
  };
}

describe("dashboard snapshot", () => {
  it("loads overview metrics, recommendations, reviews, and top firms", async () => {
    const prisma = createPrismaMocks();

    const snapshot = await loadDashboardSnapshot({
      prisma,
      recommendationLimit: 3,
      reviewLimit: 2,
      firmLimit: 1,
      now: new Date("2026-04-30T10:00:00.000Z"),
    });

    expect(snapshot).toEqual({
      generatedAt: "2026-04-30T10:00:00.000Z",
      overview: {
        totalJobs: 14,
        totalRecommendations: 6,
        activeRecommendations: 4,
        submittedReviews: 3,
        readyToSubmitReviews: 2,
        failedReviews: 1,
      },
      recommendations: [
        {
          url: "https://www.linkedin.com/jobs/view/1",
          title: "Full-Stack Engineer",
          company: "Acme",
          location: "Remote",
          platform: "linkedin",
          source: "apply-batch",
          score: 72,
          decision: "APPLY",
          policyAllowed: true,
          summary: "Strong TypeScript and React fit.",
          recommendationStatus: "RECOMMENDED",
          updatedAt: "2026-04-30T09:30:00.000Z",
        },
      ],
      recentReviews: [
        {
          jobUrl: "https://www.linkedin.com/jobs/view/2",
          status: "SUBMITTED",
          source: "apply-batch",
          score: 68,
          decision: "APPLY",
          summary: "Submitted successfully.",
          createdAt: "2026-04-30T08:45:00.000Z",
        },
      ],
      topFirms: [
        {
          name: "Acme",
          totalReviewedJobs: 5,
          appliedJobs: 2,
          skippedJobs: 2,
          logoUrl: null,
          linkedinUrl: "https://www.linkedin.com/company/acme/",
        },
      ],
    });

    expect(prisma.jobRecommendation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 3,
      }),
    );
    expect(prisma.jobReviewHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 2,
      }),
    );
    expect(prisma.firm.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 1,
      }),
    );
  });

  it("formats a readable terminal summary", () => {
    const summary = formatDashboardSummary({
      generatedAt: "2026-04-30T10:00:00.000Z",
      overview: {
        totalJobs: 14,
        totalRecommendations: 6,
        activeRecommendations: 4,
        submittedReviews: 3,
        readyToSubmitReviews: 2,
        failedReviews: 1,
      },
      recommendations: [
        {
          url: "https://www.linkedin.com/jobs/view/1",
          title: "Full-Stack Engineer",
          company: "Acme",
          location: "Remote",
          platform: "linkedin",
          source: "apply-batch",
          score: 72,
          decision: "APPLY",
          policyAllowed: true,
          summary: "Strong TypeScript and React fit.",
          recommendationStatus: "RECOMMENDED",
          updatedAt: "2026-04-30T09:30:00.000Z",
        },
      ],
      recentReviews: [
        {
          jobUrl: "https://www.linkedin.com/jobs/view/2",
          status: "SUBMITTED",
          source: "apply-batch",
          score: 68,
          decision: "APPLY",
          summary: "Submitted successfully.",
          createdAt: "2026-04-30T08:45:00.000Z",
        },
      ],
      topFirms: [
        {
          name: "Acme",
          totalReviewedJobs: 5,
          appliedJobs: 2,
          skippedJobs: 2,
          logoUrl: null,
          linkedinUrl: "https://www.linkedin.com/company/acme/",
        },
      ],
    });

    expect(summary).toContain("Dashboard snapshot");
    expect(summary).toContain("Active recommendations: 4");
    expect(summary).toContain("[72] Full-Stack Engineer at Acme");
    expect(summary).toContain("SUBMITTED APPLY 68");
    expect(summary).toContain("Acme: reviewed 5, applied 2, skipped 2");
  });
});
