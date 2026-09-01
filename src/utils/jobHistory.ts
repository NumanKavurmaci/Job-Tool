import type {
  ApplicationDecisionType,
  JobReviewHistory,
  JobReviewStatus,
  PrismaClient,
} from "@prisma/client";
import type pino from "pino";
import {
  canonicalizeJobPostingUrl,
  getLinkedInJobPostingId,
  getJobPostingUrlAliases,
} from "./jobIdentity.js";

export type { JobReviewHistory };

type JobHistoryWriter = Pick<PrismaClient, "jobReviewHistory">;
type JobDecisionReader = Pick<PrismaClient, "jobPosting">;
type JobHistoryLogger = Pick<pino.Logger, "warn">;

export interface JobReviewHistoryInput {
  jobPostingId?: string;
  jobUrl: string;
  platform?: string;
  source: string;
  status: JobReviewStatus;
  score?: number;
  threshold?: number;
  decision?: ApplicationDecisionType;
  policyAllowed?: boolean;
  reasons: string[];
  summary?: string;
  details?: Record<string, unknown>;
}

function withDashboardRunId(
  details: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const dashboardRunId = process.env.JOB_TOOL_RUN_ID?.trim();
  if (!dashboardRunId) {
    return details;
  }

  return {
    ...details,
    dashboardRunId,
  };
}

export async function recordJobReviewHistory(args: {
  prisma: JobHistoryWriter;
  logger: JobHistoryLogger;
  entry: JobReviewHistoryInput;
}): Promise<void> {
  const { prisma, logger, entry } = args;
  const details = withDashboardRunId(entry.details);

  try {
    await prisma.jobReviewHistory.create({
      data: {
        jobUrl: canonicalizeJobPostingUrl(entry.jobUrl),
        source: entry.source,
        status: entry.status,
        reasons: JSON.stringify(entry.reasons),
        ...(entry.jobPostingId ? { jobPostingId: entry.jobPostingId } : {}),
        ...(entry.platform ? { platform: entry.platform } : {}),
        ...(typeof entry.score === "number" ? { score: entry.score } : {}),
        ...(typeof entry.threshold === "number"
          ? { threshold: entry.threshold }
          : {}),
        ...(entry.decision ? { decision: entry.decision } : {}),
        ...(typeof entry.policyAllowed === "boolean"
          ? { policyAllowed: entry.policyAllowed }
          : {}),
        ...(entry.summary ? { summary: entry.summary } : {}),
        ...(details ? { detailsJson: JSON.stringify(details) } : {}),
      },
    });
  } catch (error) {
    logger.warn(
      {
        jobUrl: entry.jobUrl,
        source: entry.source,
        status: entry.status,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to persist job review history",
    );
  }
}

export async function getLatestJobReview(args: {
  prisma: JobHistoryWriter;
  jobUrl: string;
  logger?: JobHistoryLogger;
  throwOnError?: boolean;
}): Promise<JobReviewHistory | null> {
  try {
    const aliases = getJobPostingUrlAliases(args.jobUrl);
    const linkedinJobId = getLinkedInJobPostingId(args.jobUrl);
    if (linkedinJobId) {
      if (typeof args.prisma.jobReviewHistory.findFirst !== "function") {
        return null;
      }
      const exactReview = await args.prisma.jobReviewHistory.findFirst({
        where: { jobUrl: { in: aliases } },
        orderBy: [{ createdAt: "desc" }],
      });
      if (exactReview) {
        return exactReview;
      }
      if (typeof args.prisma.jobReviewHistory.findMany !== "function") {
        return null;
      }
      const reviews = await args.prisma.jobReviewHistory.findMany({
        where: {
          jobUrl: { contains: linkedinJobId },
        },
        orderBy: [{ createdAt: "desc" }],
      });
      return (
        reviews.find(
          (review) => getLinkedInJobPostingId(review.jobUrl) === linkedinJobId,
        ) ?? null
      );
    }

    if (typeof args.prisma.jobReviewHistory.findFirst !== "function") {
      return null;
    }
    return await args.prisma.jobReviewHistory.findFirst({
      where: {
        jobUrl: aliases.length === 1 ? aliases[0]! : { in: aliases },
      },
      orderBy: [{ createdAt: "desc" }],
    });
  } catch (error) {
    args.logger?.warn(
      {
        jobUrl: args.jobUrl,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to load latest job review history",
    );
    if (args.throwOnError) {
      throw error;
    }
    return null;
  }
}

export async function getLatestPersistedJobDecisionReview(args: {
  prisma: JobDecisionReader;
  jobUrl: string;
  logger?: JobHistoryLogger;
  throwOnError?: boolean;
}): Promise<JobReviewHistory | null> {
  const jobPosting = args.prisma.jobPosting;
  if (typeof jobPosting.findUnique !== "function") {
    return null;
  }

  try {
    const canonicalUrl = canonicalizeJobPostingUrl(args.jobUrl);
    const canonicalPosting = await jobPosting.findUnique({
      where: { url: canonicalUrl },
      include: {
        decisions: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    const linkedinJobId = getLinkedInJobPostingId(args.jobUrl);
    const candidates = canonicalPosting ? [canonicalPosting] : [];
    if (linkedinJobId && typeof jobPosting.findMany === "function") {
      const aliasPostings = await jobPosting.findMany({
        where: { url: { contains: linkedinJobId } },
        include: {
          decisions: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });
      for (const candidate of aliasPostings) {
        if (
          getLinkedInJobPostingId(candidate.url) === linkedinJobId &&
          !candidates.some((existing) => existing.id === candidate.id)
        ) {
          candidates.push(candidate);
        }
      }
    }

    const posting = candidates
      .filter((candidate) => candidate.decisions[0] != null)
      .sort(
        (left, right) =>
          right.decisions[0]!.createdAt.getTime() -
          left.decisions[0]!.createdAt.getTime(),
      )[0];
    const decision = posting?.decisions[0];
    if (!posting || !decision) {
      return null;
    }

    return {
      id: `application-decision:${decision.id}`,
      jobPostingId: posting.id,
      jobUrl: posting.url,
      platform: posting.platform,
      source: "application-decision",
      status: decision.decision === "SKIP" ? "SKIPPED" : "EVALUATED",
      score: decision.score,
      threshold: null,
      decision: decision.decision,
      policyAllowed: decision.policyAllowed,
      reasons: decision.reasons,
      summary: null,
      detailsJson: null,
      createdAt: decision.createdAt,
    };
  } catch (error) {
    args.logger?.warn(
      {
        jobUrl: args.jobUrl,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to load persisted job decision",
    );
    if (args.throwOnError) {
      throw error;
    }
    return null;
  }
}

export async function getLatestJobReviewsByUrl(args: {
  prisma: JobHistoryWriter;
  jobUrls: string[];
  source?: string;
  logger?: JobHistoryLogger;
}): Promise<Map<string, JobReviewHistory | null>> {
  const requestedUrls = [...new Set(args.jobUrls)];
  const identityUrls = [
    ...new Set(requestedUrls.flatMap((url) => getJobPostingUrlAliases(url))),
  ];
  const linkedinJobIds = [
    ...new Set(
      requestedUrls
        .map((url) => getLinkedInJobPostingId(url))
        .filter((jobId): jobId is string => jobId != null),
    ),
  ];
  if (identityUrls.length === 0) {
    return new Map();
  }

  try {
    const reviews = await args.prisma.jobReviewHistory.findMany({
      where: {
        OR: [
          { jobUrl: { in: identityUrls } },
          ...linkedinJobIds.map((jobId) => ({
            jobUrl: { contains: jobId },
          })),
        ],
        ...(args.source ? { source: args.source } : {}),
      },
      orderBy: [{ createdAt: "desc" }],
    });
    const latestByIdentity = new Map<string, JobReviewHistory>();
    for (const review of reviews) {
      const reviewLinkedInJobId = getLinkedInJobPostingId(review.jobUrl);
      if (
        reviewLinkedInJobId &&
        !linkedinJobIds.includes(reviewLinkedInJobId)
      ) {
        continue;
      }
      const identity = canonicalizeJobPostingUrl(review.jobUrl);
      if (!latestByIdentity.has(identity)) {
        latestByIdentity.set(identity, review);
      }
    }
    const latestByRequestedUrl = new Map<string, JobReviewHistory | null>();
    for (const requestedUrl of requestedUrls) {
      const review = latestByIdentity.get(
        canonicalizeJobPostingUrl(requestedUrl),
      );
      latestByRequestedUrl.set(requestedUrl, review ?? null);
    }
    return latestByRequestedUrl;
  } catch (error) {
    args.logger?.warn(
      {
        jobUrls: identityUrls,
        source: args.source,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to load latest job review history batch",
    );
    return new Map();
  }
}

export function shouldSkipDuplicateBatchReview(
  review: Pick<JobReviewHistory, "status">,
): boolean {
  return (
    review.status === "SKIPPED" ||
    review.status === "SKIPPED_DUE_TO_EASY_APPLY_RUN" ||
    review.status === "SUBMITTED"
  );
}

export function shouldRetryPendingApprovedReview(
  review: Pick<JobReviewHistory, "status" | "decision">,
): boolean {
  return review.decision === "APPLY" && review.status !== "SUBMITTED";
}

export function buildDuplicateReviewReason(
  review: Pick<JobReviewHistory, "createdAt" | "status" | "decision" | "score">,
): string {
  const createdAt = review.createdAt.toISOString().slice(0, 10);
  const scoreText =
    typeof review.score === "number" ? ` score ${review.score}` : " no score";
  const decisionText = review.decision ? `, decision ${review.decision}` : "";
  return `Job was already reviewed on ${createdAt} with status ${review.status},${scoreText}${decisionText}.`;
}
