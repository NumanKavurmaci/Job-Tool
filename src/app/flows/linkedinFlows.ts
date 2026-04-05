import type { CliArgs } from "../cli.js";
import type { AppDeps } from "../deps.js";
import {
  runLinkedInEasyApplyBatchFlow,
  runLinkedInEasyApplyDryRunFlow,
  runLinkedInEasyApplyFlow,
} from "./linkedinApplyShared.js";

type EasyApplyArgs = Extract<CliArgs, { mode: "easy-apply" }>;
type EasyApplyBatchArgs = Extract<CliArgs, { mode: "easy-apply-batch" }>;

export async function runEasyApplyDryRunFlow(
  args: EasyApplyArgs | EasyApplyBatchArgs,
  deps: AppDeps,
) {
  return runLinkedInEasyApplyDryRunFlow(args, deps);
}

export async function runEasyApplyFlow(
  args: EasyApplyArgs,
  deps: AppDeps,
) {
  return runLinkedInEasyApplyFlow(args, deps);
}

export async function runEasyApplyBatchFlow(
  args: EasyApplyBatchArgs,
  deps: AppDeps,
) {
  return runLinkedInEasyApplyBatchFlow(args, deps);
}
