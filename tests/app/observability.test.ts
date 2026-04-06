import { beforeEach, describe, expect, it, vi } from "vitest";

const recordJobReviewHistoryMock = vi.fn();
const writeSystemLogMock = vi.fn();

vi.mock("../../src/utils/jobHistory.js", () => ({
  recordJobReviewHistory: recordJobReviewHistoryMock,
}));

vi.mock("../../src/utils/systemLog.js", () => ({
  writeSystemLog: writeSystemLogMock,
}));

describe("app observability helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists run artifacts through the report writer", async () => {
    const { persistRunArtifact } = await import("../../src/app/observability.js");
    const deps = {
      writeRunReport: vi.fn().mockResolvedValue("artifacts/job-runs/report.json"),
    } as any;

    await expect(
      persistRunArtifact({
        category: "job-runs",
        prefix: "decide",
        payload: { ok: true },
        deps,
      }),
    ).resolves.toBe("artifacts/job-runs/report.json");

    expect(deps.writeRunReport).toHaveBeenCalledWith({
      category: "job-runs",
      prefix: "decide",
      payload: { ok: true },
    });
  });

  it("persists system events through the system log writer", async () => {
    const { persistSystemEvent } = await import("../../src/app/observability.js");
    const deps = { prisma: {}, logger: {} } as any;

    await persistSystemEvent(
      {
        level: "INFO",
        scope: "cli",
        message: "Done",
        runType: "cli",
        jobPostingId: "job_1",
        jobUrl: "https://example.com/job",
        details: { ok: true },
      },
      deps,
    );

    expect(writeSystemLogMock).toHaveBeenCalledWith({
      prisma: deps.prisma,
      logger: deps.logger,
      entry: {
        level: "INFO",
        scope: "cli",
        message: "Done",
        runType: "cli",
        jobPostingId: "job_1",
        jobUrl: "https://example.com/job",
        details: { ok: true },
      },
    });
  });

  it("persists job history through the history writer", async () => {
    const { persistJobHistory } = await import("../../src/app/observability.js");
    const deps = { prisma: {}, logger: {} } as any;

    await persistJobHistory(
      {
        jobPostingId: "job_1",
        jobUrl: "https://example.com/job",
        platform: "linkedin",
        source: "decide",
        status: "EVALUATED",
        score: 77,
        threshold: 60,
        decision: "APPLY",
        policyAllowed: true,
        reasons: ["Strong fit"],
        summary: "Strong fit",
        details: { score: 77 },
      },
      deps,
    );

    expect(recordJobReviewHistoryMock).toHaveBeenCalledWith({
      prisma: deps.prisma,
      logger: deps.logger,
      entry: {
        jobPostingId: "job_1",
        jobUrl: "https://example.com/job",
        platform: "linkedin",
        source: "decide",
        status: "EVALUATED",
        score: 77,
        threshold: 60,
        decision: "APPLY",
        policyAllowed: true,
        reasons: ["Strong fit"],
        summary: "Strong fit",
        details: { score: 77 },
      },
    });
  });

  it("maps every easy apply status to a history status", async () => {
    const { mapEasyApplyStatusToHistoryStatus } = await import("../../src/app/observability.js");

    expect(mapEasyApplyStatusToHistoryStatus("submitted")).toBe("SUBMITTED");
    expect(mapEasyApplyStatusToHistoryStatus("ready_to_submit")).toBe("READY_TO_SUBMIT");
    expect(mapEasyApplyStatusToHistoryStatus("stopped_external_apply")).toBe("SKIPPED");
    expect(mapEasyApplyStatusToHistoryStatus("stopped_not_easy_apply")).toBe("SKIPPED");
    expect(mapEasyApplyStatusToHistoryStatus("stopped_manual_review_required")).toBe("FAILED");
    expect(mapEasyApplyStatusToHistoryStatus("stopped_already_applied")).toBe("FAILED");
  });

  it("maps external handoffs conservatively so final submit is not treated as submitted", async () => {
    const { mapCombinedEasyApplyResultToHistoryStatus } = await import("../../src/app/observability.js");

    expect(
      mapCombinedEasyApplyResultToHistoryStatus({
        status: "stopped_external_apply",
        steps: [],
        stopReason: "Use company website.",
        url: "https://example.com/job",
        externalApplication: {
          sourceUrl: "https://example.com/job",
          externalApplyUrl: "https://example.com/apply",
          canonicalUrl: "https://example.com/apply",
          runType: "submit",
          status: "completed",
          finalStage: "final_submit_step",
          stopReason: "Reached final submit.",
        },
      } as any),
    ).toBe("READY_TO_SUBMIT");

    expect(
      mapCombinedEasyApplyResultToHistoryStatus({
        status: "stopped_external_apply",
        steps: [],
        stopReason: "Use company website.",
        url: "https://example.com/job",
        externalApplication: {
          sourceUrl: "https://example.com/job",
          externalApplyUrl: "https://example.com/apply",
          canonicalUrl: "https://example.com/apply",
          runType: "submit",
          status: "completed",
          finalStage: "completed",
          stopReason: "Submitted.",
        },
      } as any),
    ).toBe("SUBMITTED");
  });

  it("persists both evaluation and easy-apply-result history for batch jobs", async () => {
    const { persistBatchJobHistory } = await import("../../src/app/observability.js");
    const deps = {
      prisma: {
        jobPosting: {
          findUnique: vi.fn().mockResolvedValue({ id: "job_1" }),
        },
      },
      logger: {},
    } as any;

    await persistBatchJobHistory(
      {
        source: "easy-apply-batch",
        threshold: 60,
        jobs: [
          {
            url: "https://example.com/1",
            evaluation: {
              shouldApply: true,
              finalDecision: "APPLY",
              score: 72,
              reason: "Good fit",
              policyAllowed: true,
            },
            result: {
              status: "ready_to_submit",
              steps: [{ action: "review" }],
              stopReason: "Reached final submit.",
              url: "https://example.com/1",
            },
          },
          {
            url: "https://example.com/2",
            evaluation: {
              shouldApply: false,
              finalDecision: "SKIP",
              score: 30,
              reason: "Too low",
              policyAllowed: false,
            },
          },
        ],
      },
      deps,
    );

    expect(recordJobReviewHistoryMock).toHaveBeenCalledTimes(3);
    expect(recordJobReviewHistoryMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        entry: expect.objectContaining({
          jobPostingId: "job_1",
          jobUrl: "https://example.com/1",
          status: "EVALUATED",
          decision: "APPLY",
        }),
      }),
    );
    expect(recordJobReviewHistoryMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        entry: expect.objectContaining({
          jobPostingId: "job_1",
          jobUrl: "https://example.com/1",
          status: "READY_TO_SUBMIT",
          summary: "Reached final submit.",
        }),
      }),
    );
    expect(recordJobReviewHistoryMock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        entry: expect.objectContaining({
          jobUrl: "https://example.com/2",
          status: "SKIPPED",
          decision: "SKIP",
        }),
      }),
    );
  });

  it("detects silent batch anomalies when approved jobs are missing processing results", async () => {
    const { collectBatchRunAnomalies } = await import("../../src/app/observability.js");

    const anomalies = collectBatchRunAnomalies({
      status: "partial",
      collectionUrl: "https://www.linkedin.com/jobs/collections/top-applicant/",
      requestedCount: 2,
      attemptedCount: 0,
      evaluatedCount: 1,
      skippedCount: 0,
      pagesVisited: 1,
      stopReason: "Stopped early.",
      jobs: [
        {
          url: "https://example.com/1",
          evaluation: {
            shouldApply: true,
            finalDecision: "APPLY",
            score: 72,
            reason: "Good fit",
            policyAllowed: true,
          },
        },
      ],
    });

    expect(anomalies).toEqual([
      expect.objectContaining({
        level: "ERROR",
        message: "Approved batch jobs were never processed.",
      }),
    ]);
  });

  it("persists batch anomalies into system logs", async () => {
    const { persistBatchRunAnomalies } = await import("../../src/app/observability.js");
    const deps = { prisma: {}, logger: {} } as any;

    await persistBatchRunAnomalies(
      {
        runType: "easy-apply-batch",
        collectionUrl: "https://www.linkedin.com/jobs/collections/top-applicant/",
        result: {
          status: "partial",
          collectionUrl: "https://www.linkedin.com/jobs/collections/top-applicant/",
          requestedCount: 2,
          attemptedCount: 0,
          evaluatedCount: 1,
          skippedCount: 0,
          pagesVisited: 1,
          stopReason: "Stopped early.",
          jobs: [
            {
              url: "https://example.com/1",
              evaluation: {
                shouldApply: true,
                finalDecision: "APPLY",
                score: 72,
                reason: "Good fit",
                policyAllowed: true,
              },
            },
          ],
        },
      },
      deps,
    );

    expect(writeSystemLogMock).toHaveBeenCalledWith({
      prisma: deps.prisma,
      logger: deps.logger,
      entry: expect.objectContaining({
        level: "ERROR",
        scope: "linkedin.batch.audit",
        message: "Approved batch jobs were never processed.",
        runType: "easy-apply-batch",
      }),
    });
  });
});
