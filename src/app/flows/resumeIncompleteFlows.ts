import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

type IncompleteApplyCandidate = {
  url: string;
  title: string | null;
  company: string | null;
  resultStatus: string | null;
  stopReason: string | null;
  failureReasonCode: string | null;
  retryable: boolean;
  missingProfileData: string[];
};

async function findLatestBatchReport(): Promise<string> {
  const dir = path.resolve(process.cwd(), "artifacts", "batch-runs");
  const files = await readdir(dir, { withFileTypes: true });
  const candidates = files
    .filter((entry) => entry.isFile() && /(?:easy-apply|apply)-batch\.json$/.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  if (!candidates[0]) {
    throw new Error("No batch run artifact was found in artifacts/batch-runs.");
  }
  return path.join(dir, candidates[0]);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function inferFailureReasonCode(job: Record<string, any>): string | null {
  const result = job.result;
  if (!result) {
    return null;
  }
  if (readString(result.failureReasonCode)) {
    return result.failureReasonCode;
  }
  if (readString(result.externalApplication?.failureReasonCode)) {
    return result.externalApplication.failureReasonCode;
  }
  if (result.status === "stopped_unknown_action") {
    return "linkedin.empty_or_unrecognized_action_state";
  }
  const stopReason = String(result.externalApplication?.stopReason ?? result.stopReason ?? "").toLowerCase();
  if (/notice/.test(stopReason)) {
    return "external.missing_required_answer";
  }
  if (/privacy|consent|checkbox/.test(stopReason)) {
    return "external.checkbox_fill_mismatch";
  }
  if (result.externalApplication?.missingProfileData?.length) {
    return "external.missing_required_answer";
  }
  return result.status ? String(result.status) : null;
}

function extractIncompleteCandidates(payload: Record<string, any>): IncompleteApplyCandidate[] {
  const jobs = Array.isArray(payload.result?.jobs) ? payload.result.jobs : [];
  return jobs
    .filter((job: Record<string, any>) => {
      const status = job.result?.status;
      return status && status !== "submitted" && status !== "ready_to_submit";
    })
    .map((job: Record<string, any>) => {
      const failureReasonCode = inferFailureReasonCode(job);
      const external = job.result?.externalApplication;
      const missingProfileData = Array.isArray(external?.missingProfileData)
        ? external.missingProfileData.filter((value: unknown) => typeof value === "string")
        : [];
      const stopReason = String(external?.stopReason ?? job.result?.stopReason ?? "").toLowerCase();
      if (missingProfileData.length === 0 && /notice/.test(stopReason)) {
        missingProfileData.push("availability.noticePeriod");
      }
      return {
        url: String(job.url),
        title: readString(job.evaluation?.diagnostics?.title),
        company: readString(job.evaluation?.diagnostics?.company),
        resultStatus: readString(job.result?.status),
        stopReason: readString(external?.stopReason) ?? readString(job.result?.stopReason),
        failureReasonCode,
        retryable: Boolean(job.result?.retryable ?? external?.retryable ?? failureReasonCode),
        missingProfileData,
      };
    });
}

export async function runResumeIncompleteFlow(args: {
  reportPath?: string;
}) {
  const reportPath = args.reportPath
    ? path.resolve(args.reportPath)
    : await findLatestBatchReport();
  const payload = JSON.parse(await readFile(reportPath, "utf8")) as Record<string, any>;
  const candidates = extractIncompleteCandidates(payload);

  return {
    resumeIncomplete: {
      reportPath,
      candidateCount: candidates.length,
      candidates,
    },
  };
}
