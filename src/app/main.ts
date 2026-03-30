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
} from "./flows/easyApplyFlows.js";
import { runJobFlow } from "./flows/jobFlow.js";
import {
  runAnswerQuestionsFlow,
  runBuildProfileFlow,
} from "./flows/profileFlows.js";
import { persistSystemEvent } from "./observability.js";

function renderCliSummary(
  result: Awaited<ReturnType<typeof main>>,
): string | null {
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
        result.mode === "easy-apply-batch"
          ? result.dryRun
            ? "LinkedIn Easy Apply dry run"
            : "LinkedIn Easy Apply batch"
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
      "LinkedIn Easy Apply finished",
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

  let result;
  if (args.mode === "build-profile") {
    result = await runBuildProfileFlow(args, deps);
  } else if (args.mode === "answer-questions") {
    result = await runAnswerQuestionsFlow(args, deps);
  } else if (args.mode === "easy-apply") {
    result = args.dryRun
      ? await runEasyApplyDryRunFlow(args, deps)
      : await runEasyApplyFlow(args, deps);
  } else if (args.mode === "easy-apply-batch") {
    result = args.dryRun
      ? await runEasyApplyDryRunFlow(args, deps)
      : await runEasyApplyBatchFlow(args, deps);
  } else if (args.mode === "external-apply") {
    result = args.dryRun
      ? await runExternalApplyDryRunFlow(args, deps)
      : await runExternalApplyFlow(args, deps);
  } else {
    result = await runJobFlow(args.mode, args.url, deps, {
      useAiScoreAdjustment: args.useAiScoreAdjustment,
    });
  }

  return {
    ...result,
    durationMs: Math.round(performance.now() - startedAt),
  };
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
