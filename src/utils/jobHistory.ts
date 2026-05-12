import type {
  ApplicationDecisionType,
  JobReviewHistory,
  JobReviewStatus,
  PrismaClient,
} from "@prisma/client";
import type pino from "pino";

export type { JobReviewHistory };

type JobHistoryWriter = Pick<PrismaClient, "jobReviewHistory">;
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

export async function recordJobReviewHistory(args: {
  prisma: JobHistoryWriter;
  logger: JobHistoryLogger;
  entry: JobReviewHistoryInput;
}): Promise<void> {
  const { prisma, logger, entry } = args;

  try {
    await prisma.jobReviewHistory.create({
      data: {
        jobUrl: entry.jobUrl,
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
        ...(entry.details ? { detailsJson: JSON.stringify(entry.details) } : {}),
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
}): Promise<JobReviewHistory | null> {
  try {
    return await args.prisma.jobReviewHistory.findFirst({
      where: { jobUrl: args.jobUrl },
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
    return null;
  }
}

export async function getLatestJobReviewsByUrl(args: {
  prisma: JobHistoryWriter;
  jobUrls: string[];
  source?: string;
  logger?: JobHistoryLogger;
}): Promise<Map<string, JobReviewHistory>> {
  const uniqueUrls = [...new Set(args.jobUrls)];
  if (uniqueUrls.length === 0) {
    return new Map();
  }

  try {
    const reviews = await args.prisma.jobReviewHistory.findMany({
      where: {
        jobUrl: { in: uniqueUrls },
        ...(args.source ? { source: args.source } : {}),
      },
      orderBy: [{ jobUrl: "asc" }, { createdAt: "desc" }],
    });
    const latestByUrl = new Map<string, JobReviewHistory>();
    for (const review of reviews) {
      if (!latestByUrl.has(review.jobUrl)) {
        latestByUrl.set(review.jobUrl, review);
      }
    }
    return latestByUrl;
  } catch (error) {
    args.logger?.warn(
      {
        jobUrls: uniqueUrls,
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
