import type { PrismaClient, SystemLogLevel } from "@prisma/client";
import type pino from "pino";

type SystemLogWriter = Pick<PrismaClient, "systemLog">;
type SystemLogger = Pick<pino.Logger, "warn">;

export interface SystemLogInput {
  level: SystemLogLevel;
  scope: string;
  message: string;
  runType?: string;
  jobPostingId?: string;
  jobUrl?: string;
  details?: Record<string, unknown>;
  persistToDb?: boolean;
}

export function shouldPersistSystemLog(entry: SystemLogInput): boolean {
  if (typeof entry.persistToDb === "boolean") {
    return entry.persistToDb;
  }

  return entry.level === "WARN" || entry.level === "ERROR";
}

export async function writeSystemLog(args: {
  prisma: SystemLogWriter;
  logger: SystemLogger;
  entry: SystemLogInput;
}): Promise<void> {
  const { prisma, logger, entry } = args;

  if (!shouldPersistSystemLog(entry)) {
    return;
  }

  try {
    await prisma.systemLog.create({
      data: {
        level: entry.level,
        scope: entry.scope,
        message: entry.message,
        ...(entry.runType ? { runType: entry.runType } : {}),
        ...(entry.jobPostingId ? { jobPostingId: entry.jobPostingId } : {}),
        ...(entry.jobUrl ? { jobUrl: entry.jobUrl } : {}),
        ...(entry.details
          ? { detailsJson: JSON.stringify(entry.details) }
          : {}),
      },
    });
  } catch (error) {
    logger.warn(
      {
        scope: entry.scope,
        message: entry.message,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to persist system log",
    );
  }
}
