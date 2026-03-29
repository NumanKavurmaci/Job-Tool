import { describe, expect, it, vi } from "vitest";
import { writeSystemLog } from "../../src/utils/systemLog.js";

describe("systemLog", () => {
  it("persists system logs to the database", async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const warn = vi.fn();

    await writeSystemLog({
      prisma: {
        systemLog: { create },
      } as never,
      logger: { warn } as never,
      entry: {
        level: "INFO",
        scope: "linkedin.batch",
        message: "Batch started.",
        runType: "easy-apply-dry-run",
        jobUrl: "https://example.com/jobs/1",
        details: { requestedCount: 3 },
      },
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        level: "INFO",
        scope: "linkedin.batch",
        message: "Batch started.",
        runType: "easy-apply-dry-run",
        jobUrl: "https://example.com/jobs/1",
        detailsJson: JSON.stringify({ requestedCount: 3 }),
      },
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("does not fail the caller if system log persistence fails", async () => {
    const create = vi.fn().mockRejectedValue(new Error("db down"));
    const warn = vi.fn();

    await writeSystemLog({
      prisma: {
        systemLog: { create },
      } as never,
      logger: { warn } as never,
      entry: {
        level: "ERROR",
        scope: "cli",
        message: "CLI failed.",
      },
    });

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "cli",
        message: "CLI failed.",
      }),
      "Failed to persist system log",
    );
  });

  it("persists guaranteed observability events with minimal optional fields", async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const warn = vi.fn();

    await writeSystemLog({
      prisma: {
        systemLog: { create },
      } as never,
      logger: { warn } as never,
      entry: {
        level: "INFO",
        scope: "job.analysis",
        message: "Starting job analysis flow.",
        runType: "decide",
        jobUrl: "https://example.com/job",
      },
    });

    await writeSystemLog({
      prisma: {
        systemLog: { create },
      } as never,
      logger: { warn } as never,
      entry: {
        level: "ERROR",
        scope: "cli",
        message: "CLI execution failed.",
        runType: "cli",
      },
    });

    expect(create).toHaveBeenNthCalledWith(1, {
      data: {
        level: "INFO",
        scope: "job.analysis",
        message: "Starting job analysis flow.",
        runType: "decide",
        jobUrl: "https://example.com/job",
      },
    });
    expect(create).toHaveBeenNthCalledWith(2, {
      data: {
        level: "ERROR",
        scope: "cli",
        message: "CLI execution failed.",
        runType: "cli",
      },
    });
  });
});
