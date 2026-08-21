import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function safeTimestamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

function getDashboardRunId(): string | null {
  return process.env.JOB_TOOL_RUN_ID?.trim() || null;
}

function safeFilenameSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 128) || "run";
}

function withDashboardRunId(payload: unknown, dashboardRunId: string | null): unknown {
  if (
    !dashboardRunId ||
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return payload;
  }

  return {
    ...(payload as Record<string, unknown>),
    dashboardRunId,
  };
}

export async function writeRunReport(input: {
  category:
    | "answer-runs"
    | "batch-runs"
    | "external-apply-runs"
    | "easy-apply-runs"
    | "job-runs"
    | "profile-runs";
  prefix: string;
  payload: unknown;
}): Promise<string> {
  const directory = path.resolve(process.cwd(), "artifacts", input.category);
  await mkdir(directory, { recursive: true });
  const dashboardRunId = getDashboardRunId();
  const runIdSegment = dashboardRunId ? `${safeFilenameSegment(dashboardRunId)}-` : "";
  const filename = `${safeTimestamp()}-${runIdSegment}${input.prefix}.json`;
  const fullPath = path.join(directory, filename);
  const payload = withDashboardRunId(input.payload, dashboardRunId);
  await writeFile(fullPath, JSON.stringify(payload, null, 2), "utf8");
  return fullPath;
}

export function formatBatchTerminalSummary(input: {
  label: string;
  status: string;
  requestedCount: number;
  attemptedCount: number;
  evaluatedCount: number;
  skippedCount: number;
  pagesVisited: number;
  stopReason: string;
  reportPath?: string;
}): string {
  const lines = [
    "========================================",
    `${input.label} finished`,
    "========================================",
    `Status: ${input.status}`,
    `Requested: ${input.requestedCount}`,
    `Attempted: ${input.attemptedCount}`,
    `Evaluated: ${input.evaluatedCount}`,
    `Skipped: ${input.skippedCount}`,
    `Pages visited: ${input.pagesVisited}`,
    `Reason: ${input.stopReason}`,
  ];

  if (input.reportPath) {
    lines.push(`Report: ${input.reportPath}`);
  }

  lines.push("========================================");

  return `\n${lines.join("\n")}\n`;
}
