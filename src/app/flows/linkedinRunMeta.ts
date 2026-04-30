import type { CliArgs } from "../cli.js";
import type { EasyApplyBatchRunResult, EasyApplyRunResult } from "../../linkedin/easyApply.js";

type EasyApplyBatchArgs = Extract<CliArgs, { mode: "easy-apply-batch" }>;
type ApplyBatchArgs = Extract<CliArgs, { mode: "apply-batch" }>;
type LinkedInApplyArgs =
  | Extract<CliArgs, { mode: "easy-apply" }>
  | Extract<CliArgs, { mode: "apply" }>
  | EasyApplyBatchArgs
  | ApplyBatchArgs;

export type EasyApplyRunType =
  | "easy-apply"
  | "easy-apply-dry-run"
  | "easy-apply-batch"
  | "apply"
  | "apply-dry-run"
  | "apply-batch";

export function getEasyApplyRunType(args: LinkedInApplyArgs): EasyApplyRunType {
  if (args.dryRun) {
    return args.mode === "apply" || args.mode === "apply-batch"
      ? "apply-dry-run"
      : "easy-apply-dry-run";
  }

  if (args.mode === "apply-batch") {
    return "apply-batch";
  }
  if (args.mode === "apply") {
    return "apply";
  }

  return args.mode === "easy-apply-batch" ? "easy-apply-batch" : "easy-apply";
}

export function getBatchPersistenceSource(
  args: EasyApplyBatchArgs | ApplyBatchArgs,
): "easy-apply-batch" | "apply-batch" {
  return args.mode === "apply-batch" ? "apply-batch" : "easy-apply-batch";
}

export function getBatchCompletionLabel(args: EasyApplyBatchArgs | ApplyBatchArgs): string {
  return args.mode === "apply-batch"
    ? "LinkedIn Apply batch finished"
    : "LinkedIn Easy Apply batch finished";
}

export function buildLinkedInSingleRunMeta(args: {
  mode: "easy-apply" | "apply";
  dryRun: boolean;
  url: string;
  durationMs: number;
  result: EasyApplyRunResult;
}) {
  const siteFeedbackCount =
    (args.result.siteFeedback?.errors.length ?? 0) +
    (args.result.siteFeedback?.warnings.length ?? 0) +
    (args.result.siteFeedback?.infos.length ?? 0);

  return {
    durationMs: args.durationMs,
    finishedAt: new Date().toISOString(),
    summary: `${args.mode}${args.dryRun ? " dry run" : ""} finished with status ${args.result.status} after ${args.durationMs}ms.`,
    keyEvents: [
      "Opened LinkedIn job page.",
      args.result.externalApplyUrl
        ? "Detected an external application path on LinkedIn."
        : `Completed ${args.result.steps.length} LinkedIn form step(s).`,
      args.result.externalApplication
        ? `External handoff finished with status ${args.result.externalApplication.status}.`
        : "No external handoff was used.",
      siteFeedbackCount > 0
        ? `Captured ${siteFeedbackCount} site feedback message(s).`
        : "No site feedback was captured.",
    ],
    metrics: {
      stepCount: args.result.steps.length,
      siteFeedbackCount,
      usedExternalHandoff: Boolean(args.result.externalApplication),
      externalHandoffStatus: args.result.externalApplication?.status ?? null,
    },
    urls: {
      jobUrl: args.url,
      ...(args.result.externalApplyUrl
        ? { externalApplyUrl: args.result.externalApplyUrl }
        : {}),
      ...(args.result.externalApplication?.canonicalUrl
        ? { canonicalExternalUrl: args.result.externalApplication.canonicalUrl }
        : {}),
    },
    stopReason: args.result.stopReason,
  };
}

export function buildLinkedInBatchRunMeta(args: {
  mode: "easy-apply-batch" | "apply-batch";
  dryRun: boolean;
  collectionUrl: string;
  durationMs: number;
  result: EasyApplyBatchRunResult;
}) {
  const externalHandoffs = args.result.jobs.filter(
    (job) => job.result?.externalApplication != null,
  ).length;
  const failureCount = args.result.jobs.filter(
    (job) =>
      job.result?.status === "stopped_unknown_action" ||
      job.result?.status === "stopped_manual_review",
  ).length;

  return {
    durationMs: args.durationMs,
    finishedAt: new Date().toISOString(),
    summary: `${args.mode}${args.dryRun ? " dry run" : ""} evaluated ${args.result.evaluatedCount} job(s), attempted ${args.result.attemptedCount}, and finished ${args.result.status} after ${args.durationMs}ms.`,
    keyEvents: [
      "Opened LinkedIn collection.",
      `Visited ${args.result.pagesVisited} page(s) and evaluated ${args.result.evaluatedCount} job(s).`,
      `Attempted ${args.result.attemptedCount} approved job(s) and skipped ${args.result.skippedCount}.`,
      externalHandoffs > 0
        ? `Used external handoff for ${externalHandoffs} job(s).`
        : "No external handoffs were used.",
      failureCount > 0
        ? `${failureCount} attempted job(s) ended with a failure-style stop.`
        : "No attempted job ended with a failure-style stop.",
    ],
    metrics: {
      requestedCount: args.result.requestedCount,
      attemptedCount: args.result.attemptedCount,
      evaluatedCount: args.result.evaluatedCount,
      skippedCount: args.result.skippedCount,
      pagesVisited: args.result.pagesVisited,
      externalHandoffs,
      failureCount,
    },
    urls: {
      collectionUrl: args.collectionUrl,
    },
    stopReason: args.result.stopReason,
  };
}
