import type { CliArgs } from "../cli.js";
import type { AppDeps } from "../deps.js";
import {
  runLinkedInApplyBatchFlow,
  runLinkedInApplyDryRunFlow,
  runLinkedInApplyFlow,
} from "./linkedinApplyShared.js";

type ApplyArgs = Extract<CliArgs, { mode: "apply" }>;
type ApplyBatchArgs = Extract<CliArgs, { mode: "apply-batch" }>;

export async function runApplyDryRunFlow(
  args: ApplyArgs | ApplyBatchArgs,
  deps: AppDeps,
) {
  return runLinkedInApplyDryRunFlow(args, deps);
}

export async function runApplyFlow(
  args: ApplyArgs,
  deps: AppDeps,
) {
  return runLinkedInApplyFlow(args, deps);
}

export async function runApplyBatchFlow(
  args: ApplyBatchArgs,
  deps: AppDeps,
) {
  return runLinkedInApplyBatchFlow(args, deps);
}
