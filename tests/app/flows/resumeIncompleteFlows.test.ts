import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { main, runCli } from "../../../src/app/main.js";
import { runResumeIncompleteFlow } from "../../../src/app/flows/resumeIncompleteFlows.js";

async function writeBatchReport() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "job-tool-resume-incomplete-"));
  const reportPath = path.join(tempDir, "batch.json");
  await writeFile(
    reportPath,
    JSON.stringify({
      result: {
        jobs: [
          {
            url: "https://www.linkedin.com/jobs/view/1",
            evaluation: {
              diagnostics: {
                title: "Software Engineer",
                company: "Virtuagym",
              },
            },
            result: {
              status: "stopped_external_apply",
              stopReason: "This LinkedIn job redirects to an external application page.",
              externalApplication: {
                stopReason: "Could not submit because required fields remain unanswered: Privacy consent checkbox.",
              },
            },
          },
          {
            url: "https://www.linkedin.com/jobs/view/2",
            evaluation: {
              diagnostics: {
                title: "SDK Engineer",
                company: "Storyteller",
              },
            },
            result: {
              status: "stopped_external_apply",
              externalApplication: {
                stopReason: "Could not submit because required fields remain unanswered: Notice Period*.",
              },
            },
          },
          {
            url: "https://www.linkedin.com/jobs/view/3",
            evaluation: {
              diagnostics: {
                title: "AI Developer",
                company: "Pentanom",
              },
            },
            result: {
              status: "stopped_unknown_action",
              stopReason: "Could not determine the next Easy Apply action.",
            },
          },
          {
            url: "https://www.linkedin.com/jobs/view/4",
            result: {
              status: "submitted",
            },
          },
        ],
      },
    }),
    "utf8",
  );
  return reportPath;
}

async function writeBatchReportPayload(payload: Record<string, unknown>, filename = "batch.json") {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "job-tool-resume-incomplete-"));
  const reportPath = path.join(tempDir, filename);
  await writeFile(reportPath, JSON.stringify(payload), "utf8");
  return reportPath;
}

function buildDeps() {
  return {
    getConfiguredProviderInfo: () => ({ provider: "local", model: "test-model" }),
    checkLocalLlmConnection: async () => undefined,
    logger: {
      info: () => undefined,
      error: () => undefined,
    },
    prisma: {
      $disconnect: async () => undefined,
    },
    exit: () => undefined,
  } as any;
}

describe("resume incomplete flow", () => {
  it("extracts retry candidates and infers legacy failure codes", async () => {
    const reportPath = await writeBatchReport();

    const result = await runResumeIncompleteFlow({ reportPath });

    expect(result.resumeIncomplete.candidateCount).toBe(3);
    expect(result.resumeIncomplete.candidates.map((candidate) => candidate.failureReasonCode)).toEqual([
      "external.checkbox_fill_mismatch",
      "external.missing_required_answer",
      "linkedin.empty_or_unrecognized_action_state",
    ]);
    expect(result.resumeIncomplete.candidates[1]?.missingProfileData).toEqual([
      "availability.noticePeriod",
    ]);
  });

  it("runs through main and renders the CLI summary", async () => {
    const reportPath = await writeBatchReport();
    const deps = buildDeps();
    const result = await main(["resume-incomplete", reportPath], deps);
    expect(result.resumeIncomplete.candidateCount).toBe(3);

    const originalArgv = process.argv;
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      process.argv = ["node", "src/index.ts", "resume-incomplete", reportPath];
      await runCli(deps);
      expect(write.mock.calls.join("\n")).toContain("Incomplete apply candidates");
    } finally {
      process.argv = originalArgv;
      write.mockRestore();
    }
  });

  it("preserves new failure metadata and skips ready-to-submit candidates", async () => {
    const reportPath = await writeBatchReportPayload({
      result: {
        jobs: [
          {
            url: "https://jobs.example.com/a",
            evaluation: {
              diagnostics: {
                title: "",
                company: "Acme",
              },
            },
            result: {
              status: "stopped_external_apply",
              retryable: false,
              externalApplication: {
                stopReason: "Missing a required field.",
                failureReasonCode: "external.required_field_fill_failed",
                missingProfileData: ["availability.startDate", 12],
              },
            },
          },
          {
            url: "https://jobs.example.com/b",
            result: {
              status: "ready_to_submit",
            },
          },
        ],
      },
    });

    const result = await runResumeIncompleteFlow({ reportPath });

    expect(result.resumeIncomplete.candidates).toEqual([
      expect.objectContaining({
        title: null,
        company: "Acme",
        failureReasonCode: "external.required_field_fill_failed",
        retryable: false,
        missingProfileData: ["availability.startDate"],
      }),
    ]);
  });

  it("uses the latest batch artifact when no report path is provided", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "job-tool-resume-incomplete-cwd-"));
    const batchDir = path.join(tempDir, "artifacts", "batch-runs");
    await mkdir(batchDir, { recursive: true });
    await writeFile(
      path.join(batchDir, "2026-01-01-easy-apply-batch.json"),
      JSON.stringify({ result: { jobs: [] } }),
      "utf8",
    );
    await writeFile(
      path.join(batchDir, "2026-01-02-apply-batch.json"),
      JSON.stringify({
        result: {
          jobs: [
            {
              url: "https://jobs.example.com/latest",
              result: { status: "stopped_external_apply" },
            },
          ],
        },
      }),
      "utf8",
    );

    const originalCwd = process.cwd();
    try {
      process.chdir(tempDir);
      const result = await runResumeIncompleteFlow({});
      expect(result.resumeIncomplete.reportPath).toBe(
        path.join(batchDir, "2026-01-02-apply-batch.json"),
      );
      expect(result.resumeIncomplete.candidateCount).toBe(1);
      expect(result.resumeIncomplete.candidates[0]?.failureReasonCode).toBe("stopped_external_apply");
    } finally {
      process.chdir(originalCwd);
    }
  });
});
