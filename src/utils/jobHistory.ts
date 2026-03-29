import type {
  ApplicationDecisionType,
  JobReviewHistory,
  JobReviewStatus,
  PrismaClient,
} from "@prisma/client";
import type pino from "pino";

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
}): Promise<JobReviewHistory | null> {
  return args.prisma.jobReviewHistory.findFirst({
    where: { jobUrl: args.jobUrl },
    orderBy: [{ createdAt: "desc" }],
  });
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
