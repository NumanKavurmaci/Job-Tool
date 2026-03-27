import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function safeTimestamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

export async function writeRunReport(input: {
  category: "batch-runs";
  prefix: string;
  payload: unknown;
}): Promise<string> {
  const directory = path.resolve(process.cwd(), "artifacts", input.category);
  await mkdir(directory, { recursive: true });
  const filename = `${safeTimestamp()}-${input.prefix}.json`;
  const fullPath = path.join(directory, filename);
  await writeFile(fullPath, JSON.stringify(input.payload, null, 2), "utf8");
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
    `${input.label} finished`,
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

  return `${lines.join("\n")}\n`;
}
