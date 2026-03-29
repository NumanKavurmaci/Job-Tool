import type { EasyApplyBatchJobResult, EasyApplyRunResult } from "../linkedin/easyApply.js";
import {
  recordJobReviewHistory,
  type JobReviewHistoryInput,
} from "../utils/jobHistory.js";
import { writeSystemLog, type SystemLogInput } from "../utils/systemLog.js";
import type { AppDeps } from "./deps.js";

export async function persistRunArtifact(args: {
  category: "answer-runs" | "batch-runs" | "easy-apply-runs" | "job-runs" | "profile-runs";
  prefix: string;
  payload: unknown;
  deps: AppDeps;
}): Promise<string> {
  return args.deps.writeRunReport({
    category: args.category,
    prefix: args.prefix,
    payload: args.payload,
  });
}

export async function persistSystemEvent(
  args: SystemLogInput,
  deps: AppDeps,
): Promise<void> {
  await writeSystemLog({
    prisma: deps.prisma,
    logger: deps.logger,
    entry: args,
  });
}

export async function persistJobHistory(
  args: JobReviewHistoryInput,
  deps: AppDeps,
): Promise<void> {
  await recordJobReviewHistory({
    prisma: deps.prisma,
    logger: deps.logger,
    entry: args,
  });
}

export function mapEasyApplyStatusToHistoryStatus(
  status: EasyApplyRunResult["status"],
  finalDecision?: "APPLY" | "MAYBE" | "SKIP",
): "READY_TO_SUBMIT" | "SUBMITTED" | "FAILED" | "SKIPPED" | "SKIPPED_DUE_TO_EASY_APPLY_RUN" {
  if (status === "submitted") {
    return "SUBMITTED";
  }
  if (status === "ready_to_submit") {
    return "READY_TO_SUBMIT";
  }
  if (status === "stopped_external_apply" || status === "stopped_not_easy_apply") {
    return finalDecision === "APPLY" ? "SKIPPED_DUE_TO_EASY_APPLY_RUN" : "SKIPPED";
  }
  return "FAILED";
}

export async function persistBatchJobHistory(
  args: {
    source: "easy-apply-batch" | "easy-apply-dry-run";
    threshold: number;
    jobs: EasyApplyBatchJobResult[];
  },
  deps: AppDeps,
): Promise<void> {
  for (const job of args.jobs) {
    if (job.evaluation.alreadyApplied) {
      continue;
    }

    const evaluationStatus =
      job.evaluation.finalDecision === "SKIP" ? "SKIPPED" : "EVALUATED";

    await persistJobHistory(
      {
        jobUrl: job.url,
        source: args.source,
        status: evaluationStatus,
        score: job.evaluation.score,
        threshold: args.threshold,
        decision: job.evaluation.finalDecision,
        policyAllowed: job.evaluation.policyAllowed,
        reasons: [job.evaluation.reason],
        summary: job.evaluation.reason,
        details: {
          finalDecision: job.evaluation.finalDecision,
          shouldApply: job.evaluation.shouldApply,
        },
      },
      deps,
    );

    if (job.result) {
      await persistJobHistory(
        {
          jobUrl: job.url,
          source: args.source,
          status: mapEasyApplyStatusToHistoryStatus(
            job.result.status,
            job.evaluation.finalDecision,
          ),
          score: job.evaluation.score,
          threshold: args.threshold,
          decision: job.evaluation.finalDecision,
          policyAllowed: job.evaluation.policyAllowed,
          reasons: [job.result.stopReason],
          summary: job.result.stopReason,
          details: {
            easyApplyStatus: job.result.status,
            stepCount: job.result.steps.length,
          },
        },
        deps,
      );
    }
  }
}
