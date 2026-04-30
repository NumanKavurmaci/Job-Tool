import type {
  ApplicationDecisionType,
  JobReviewStatus,
  RecommendationStatus,
} from "@prisma/client";

export interface DashboardRecommendationItem {
  url: string;
  title: string | null;
  company: string | null;
  location: string | null;
  platform: string | null;
  source: string;
  score: number;
  decision: ApplicationDecisionType;
  policyAllowed: boolean;
  summary: string;
  recommendationStatus: RecommendationStatus;
  updatedAt: string;
}

export interface DashboardReviewItem {
  jobUrl: string;
  status: JobReviewStatus;
  source: string;
  score: number | null;
  decision: ApplicationDecisionType | null;
  summary: string | null;
  createdAt: string;
}

export interface DashboardFirmItem {
  name: string;
  totalReviewedJobs: number;
  appliedJobs: number;
  skippedJobs: number;
  logoUrl: string | null;
  linkedinUrl: string | null;
}

export interface DashboardSnapshot {
  generatedAt: string;
  overview: {
    totalJobs: number;
    activeRecommendations: number;
    totalRecommendations: number;
    submittedReviews: number;
    readyToSubmitReviews: number;
    failedReviews: number;
  };
  recommendations: DashboardRecommendationItem[];
  recentReviews: DashboardReviewItem[];
  topFirms: DashboardFirmItem[];
}

type DashboardPrisma = {
  jobPosting: {
    count(args?: unknown): Promise<number>;
  };
  jobRecommendation: {
    count(args?: unknown): Promise<number>;
    findMany(args: unknown): Promise<unknown[]>;
  };
  jobReviewHistory: {
    count(args?: unknown): Promise<number>;
    findMany(args: unknown): Promise<unknown[]>;
  };
  firm: {
    findMany(args: unknown): Promise<unknown[]>;
  };
};

export async function loadDashboardSnapshot(args: {
  prisma: DashboardPrisma;
  recommendationLimit?: number;
  reviewLimit?: number;
  firmLimit?: number;
  now?: Date;
}): Promise<DashboardSnapshot> {
  const recommendationLimit = args.recommendationLimit ?? 5;
  const reviewLimit = args.reviewLimit ?? 8;
  const firmLimit = args.firmLimit ?? 5;

  const [
    totalJobs,
    totalRecommendations,
    activeRecommendations,
    submittedReviews,
    readyToSubmitReviews,
    failedReviews,
    recommendations,
    recentReviews,
    topFirms,
  ] = await Promise.all([
    args.prisma.jobPosting.count(),
    args.prisma.jobRecommendation.count(),
    args.prisma.jobRecommendation.count({
      where: { recommendationStatus: "RECOMMENDED" },
    }),
    args.prisma.jobReviewHistory.count({
      where: { status: "SUBMITTED" },
    }),
    args.prisma.jobReviewHistory.count({
      where: { status: "READY_TO_SUBMIT" },
    }),
    args.prisma.jobReviewHistory.count({
      where: { status: "FAILED" },
    }),
    args.prisma.jobRecommendation.findMany({
      where: {
        recommendationStatus: {
          in: ["RECOMMENDED", "NOT_RECOMMENDED"],
        },
      },
      orderBy: [{ updatedAt: "desc" }],
      take: recommendationLimit,
      include: {
        jobPosting: {
          select: {
            url: true,
            title: true,
            company: true,
            location: true,
            platform: true,
          },
        },
      },
    }),
    args.prisma.jobReviewHistory.findMany({
      orderBy: [{ createdAt: "desc" }],
      take: reviewLimit,
      select: {
        jobUrl: true,
        status: true,
        source: true,
        score: true,
        decision: true,
        summary: true,
        createdAt: true,
      },
    }),
    args.prisma.firm.findMany({
      where: {
        totalReviewedJobs: {
          gt: 0,
        },
      },
      orderBy: [{ totalReviewedJobs: "desc" }, { appliedJobs: "desc" }],
      take: firmLimit,
      select: {
        name: true,
        totalReviewedJobs: true,
        appliedJobs: true,
        skippedJobs: true,
        logoUrl: true,
        linkedinUrl: true,
      },
    }),
  ]);

  const typedRecommendations = recommendations as Array<{
    source: string;
    score: number;
    decision: ApplicationDecisionType;
    policyAllowed: boolean;
    summary: string;
    recommendationStatus: RecommendationStatus;
    updatedAt: Date;
    jobPosting: {
      url: string;
      title: string | null;
      company: string | null;
      location: string | null;
      platform: string | null;
    };
  }>;
  const typedReviews = recentReviews as Array<{
    jobUrl: string;
    status: JobReviewStatus;
    source: string;
    score: number | null;
    decision: ApplicationDecisionType | null;
    summary: string | null;
    createdAt: Date;
  }>;
  const typedFirms = topFirms as DashboardFirmItem[];

  return {
    generatedAt: (args.now ?? new Date()).toISOString(),
    overview: {
      totalJobs,
      totalRecommendations,
      activeRecommendations,
      submittedReviews,
      readyToSubmitReviews,
      failedReviews,
    },
    recommendations: typedRecommendations.map((recommendation) => ({
      url: recommendation.jobPosting.url,
      title: recommendation.jobPosting.title,
      company: recommendation.jobPosting.company,
      location: recommendation.jobPosting.location,
      platform: recommendation.jobPosting.platform,
      source: recommendation.source,
      score: recommendation.score,
      decision: recommendation.decision,
      policyAllowed: recommendation.policyAllowed,
      summary: recommendation.summary,
      recommendationStatus: recommendation.recommendationStatus,
      updatedAt: recommendation.updatedAt.toISOString(),
    })),
    recentReviews: typedReviews.map((review) => ({
      jobUrl: review.jobUrl,
      status: review.status,
      source: review.source,
      score: review.score,
      decision: review.decision,
      summary: review.summary,
      createdAt: review.createdAt.toISOString(),
    })),
    topFirms: typedFirms,
  };
}

export function formatDashboardSummary(snapshot: DashboardSnapshot): string {
  const lines = [
    "Dashboard snapshot",
    `Generated: ${snapshot.generatedAt}`,
    `Jobs tracked: ${snapshot.overview.totalJobs}`,
    `Active recommendations: ${snapshot.overview.activeRecommendations}`,
    `Total recommendations: ${snapshot.overview.totalRecommendations}`,
    `Submitted reviews: ${snapshot.overview.submittedReviews}`,
    `Ready to submit: ${snapshot.overview.readyToSubmitReviews}`,
    `Failed reviews: ${snapshot.overview.failedReviews}`,
  ];

  if (snapshot.recommendations.length > 0) {
    lines.push("", "Recent recommendations:");
    for (const recommendation of snapshot.recommendations) {
      lines.push(
        `- [${recommendation.score}] ${recommendation.title ?? "Untitled role"} at ${recommendation.company ?? "Unknown company"} (${recommendation.recommendationStatus})`,
      );
    }
  }

  if (snapshot.recentReviews.length > 0) {
    lines.push("", "Recent reviews:");
    for (const review of snapshot.recentReviews) {
      lines.push(
        `- ${review.status} ${review.decision ?? "UNKNOWN"} ${review.score ?? "-"} ${review.jobUrl}`,
      );
    }
  }

  if (snapshot.topFirms.length > 0) {
    lines.push("", "Top firms:");
    for (const firm of snapshot.topFirms) {
      lines.push(
        `- ${firm.name}: reviewed ${firm.totalReviewedJobs}, applied ${firm.appliedJobs}, skipped ${firm.skippedJobs}`,
      );
    }
  }

  return `${lines.join("\n")}\n`;
}
