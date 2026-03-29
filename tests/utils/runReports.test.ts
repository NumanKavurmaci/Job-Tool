import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("runReports", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("formats a batch terminal summary with a report path", async () => {
    const { formatBatchTerminalSummary } = await import(
      "../../src/utils/runReports.js"
    );

    const summary = formatBatchTerminalSummary({
      label: "LinkedIn Easy Apply dry run",
      status: "partial",
      requestedCount: 10,
      attemptedCount: 2,
      evaluatedCount: 8,
      skippedCount: 6,
      pagesVisited: 3,
      stopReason: "No more eligible jobs were found.",
      reportPath: "artifacts/batch-runs/example.json",
    });

    expect(summary.startsWith("\n========================================")).toBe(true);
    expect(summary).toContain("LinkedIn Easy Apply dry run finished");
    expect(summary).toContain("Status: partial");
    expect(summary).toContain("Requested: 10");
    expect(summary).toContain("Report: artifacts/batch-runs/example.json");
    expect(summary.trimEnd().endsWith("========================================")).toBe(true);
  });

  it("formats a batch terminal summary without a report path", async () => {
    const { formatBatchTerminalSummary } = await import(
      "../../src/utils/runReports.js"
    );

    const summary = formatBatchTerminalSummary({
      label: "LinkedIn Easy Apply batch",
      status: "completed",
      requestedCount: 3,
      attemptedCount: 3,
      evaluatedCount: 5,
      skippedCount: 2,
      pagesVisited: 2,
      stopReason: "Requested jobs were processed.",
    });

    expect(summary).toContain("LinkedIn Easy Apply batch finished");
    expect(summary).not.toContain("Report:");
    expect(summary).toContain("Pages visited: 2");
  });

  it("writes a JSON report into the artifacts batch-runs directory", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "job-tool-run-report-"));
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const { writeRunReport } = await import("../../src/utils/runReports.js");
    const payload = {
      requestedCount: 3,
      attemptedCount: 1,
      jobs: [{ url: "https://www.linkedin.com/jobs/view/1", status: "SKIP" }],
    };

    const reportPath = await writeRunReport({
      category: "batch-runs",
      prefix: "easy-apply-dry-run",
      payload,
    });

    expect(reportPath).toContain(
      path.join("artifacts", "batch-runs"),
    );
    expect(path.basename(reportPath)).toMatch(
      /^\d{4}-\d{2}-\d{2}T.*-easy-apply-dry-run\.json$/,
    );

    const savedContent = await readFile(reportPath, "utf8");
    expect(JSON.parse(savedContent)).toEqual(payload);
  });
});
