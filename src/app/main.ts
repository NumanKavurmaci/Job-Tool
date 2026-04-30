import { performance } from "node:perf_hooks";
import { getErrorMessage, serializeError } from "../utils/errors.js";
import { formatBatchTerminalSummary } from "../utils/runReports.js";
import { parseCliArgs } from "./cli.js";
import { appDeps, type AppDeps } from "./deps.js";
import {
  runExternalApplyDryRunFlow,
  runExternalApplyFlow,
} from "./flows/externalApplyFlows.js";
import {
  runEasyApplyBatchFlow,
  runEasyApplyDryRunFlow,
  runEasyApplyFlow,
} from "./flows/linkedinFlows.js";
import {
  runApplyBatchFlow,
  runApplyDryRunFlow,
  runApplyFlow,
} from "./flows/applyFlows.js";
import { runJobFlow } from "./flows/jobFlow.js";
import {
  runAnswerQuestionsFlow,
  runBuildProfileFlow,
} from "./flows/profileFlows.js";
import { persistSystemEvent } from "./observability.js";
import { runExploreBatchFlow } from "./flows/exploreFlows.js";

function renderCliSummary(
  result: Awaited<ReturnType<typeof main>>,
): string | null {
  if ("explore" in result) {
    return (
      [
        "Explore batch finished",
        `Status: ${result.explore.status}`,
        `Requested: ${result.explore.requestedCount}`,
        `Evaluated: ${result.explore.evaluatedCount}`,
        `Recommended: ${result.explore.recommendedCount}`,
        `Skipped: ${result.explore.skippedCount}`,
        `Pages visited: ${result.explore.pagesVisited}`,
        `Reason: ${result.explore.stopReason}`,
        ...("reportPath" in result && typeof result.reportPath === "string"
          ? [`Report: ${result.reportPath}`]
          : []),
      ].join("\n") + "\n"
    );
  }

  if (!("easyApply" in result)) {
    return null;
  }

  if ("jobs" in result.easyApply) {
    const reportPath =
      "reportPath" in result && typeof result.reportPath === "string"
        ? result.reportPath
        : undefined;

    return formatBatchTerminalSummary({
      label:
        result.mode === "apply-batch"
          ? result.dryRun
            ? "LinkedIn Apply dry run"
            : "LinkedIn Apply batch"
          : result.mode === "easy-apply-batch"
          ? result.dryRun
            ? "LinkedIn Easy Apply dry run"
            : "LinkedIn Easy Apply batch"
          : result.mode === "apply"
            ? result.dryRun
              ? "LinkedIn Apply dry run"
              : "LinkedIn Apply"
            : "LinkedIn Easy Apply dry run",
      status: result.easyApply.status,
      requestedCount: result.easyApply.requestedCount,
      attemptedCount: result.easyApply.attemptedCount,
      evaluatedCount: result.easyApply.evaluatedCount,
      skippedCount: result.easyApply.skippedCount,
      pagesVisited: result.easyApply.pagesVisited,
      stopReason: result.easyApply.stopReason,
      ...(reportPath ? { reportPath } : {}),
    });
  }

  return (
    [
      result.mode === "apply" ? "LinkedIn Apply finished" : "LinkedIn Easy Apply finished",
      `Status: ${result.easyApply.status}`,
      `Steps: ${result.easyApply.steps.length}`,
      `Reason: ${result.easyApply.stopReason}`,
      ...("reportPath" in result && typeof result.reportPath === "string"
        ? [`Report: ${result.reportPath}`]
        : []),
    ].join("\n") + "\n"
  );
}

export async function main(
  cliArgs = process.argv.slice(2),
  deps: AppDeps = appDeps,
) {
  const startedAt = performance.now();
  const args = Array.isArray(cliArgs)
    ? parseCliArgs(cliArgs)
    : parseCliArgs([cliArgs]);
  const llmProviderInfo = deps.getConfiguredProviderInfo();

  deps.logger.info(
    {
      provider: llmProviderInfo.provider,
      model: llmProviderInfo.model,
    },
    `Using LLM provider: ${llmProviderInfo.provider} (${llmProviderInfo.model})`,
  );

  const result = await runCommand(args, deps);

  return {
    ...result,
    durationMs: Math.round(performance.now() - startedAt),
  };
}

async function runCommand(
  args: ReturnType<typeof parseCliArgs>,
  deps: AppDeps,
) {
  switch (args.mode) {
    case "build-profile":
      return runBuildProfileFlow(args, deps);
    case "answer-questions":
      return runAnswerQuestionsFlow(args, deps);
    case "easy-apply":
      return args.dryRun
        ? runEasyApplyDryRunFlow(args, deps)
        : runEasyApplyFlow(args, deps);
    case "apply":
      return args.dryRun
        ? runApplyDryRunFlow(args, deps)
        : runApplyFlow(args, deps);
    case "easy-apply-batch":
      return args.dryRun
        ? runEasyApplyDryRunFlow(args, deps)
        : runEasyApplyBatchFlow(args, deps);
    case "apply-batch":
      return args.dryRun
        ? runApplyDryRunFlow(args, deps)
        : runApplyBatchFlow(args, deps);
    case "external-apply":
      return args.dryRun
        ? runExternalApplyDryRunFlow(args, deps)
        : runExternalApplyFlow(args, deps);
    case "explore-batch":
      return runExploreBatchFlow(args, deps);
    case "score":
    case "decide":
    case "explore":
      return runJobFlow(args.mode, args.url, deps, {
        useAiScoreAdjustment: args.useAiScoreAdjustment,
      });
  }
}

export async function runCli(deps: AppDeps = appDeps): Promise<void> {
  try {
    const result = await main(process.argv.slice(2), deps);
    const summary = renderCliSummary(result);
    if (summary) {
      process.stdout.write(summary);
    }
  } catch (error: unknown) {
    deps.logger.error(
      {
        event: "cli.failed",
        error: serializeError(error),
      },
      "CLI execution failed",
    );
    await persistSystemEvent(
      {
        level: "ERROR",
        scope: "cli",
        message: "CLI execution failed.",
        runType: "cli",
        details: { error: serializeError(error) },
      },
      deps,
    );
    process.stderr.write(`Error: ${getErrorMessage(error)}\n`);
    deps.exit(1);
  } finally {
    await deps.prisma.$disconnect();
  }
}

export { parseCliArgs };
