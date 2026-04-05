import { performance } from "node:perf_hooks";
import { AppError, serializeError } from "../../utils/errors.js";
import { getLatestJobReview } from "../../utils/jobHistory.js";
import {
  jobPostingNeedsMetadataRefresh,
  persistDetectedAppliedJobRecord,
  refreshJobPostingMetadata,
} from "../../utils/jobPersistence.js";
import type { CliArgs } from "../cli.js";
import { LINKEDIN_BROWSER_SESSION_OPTIONS } from "../constants.js";
import type { AppDeps } from "../deps.js";
import {
  createBatchJobEvaluator,
  createCandidateAnswerResolver,
  loadMasterProfileForArgs,
} from "../flowHelpers.js";
import {
  ensureBatchJobProcessingResults,
  mapCombinedEasyApplyResultToHistoryStatus,
  persistBatchRunAnomalies,
  persistBatchJobHistory,
  persistJobHistory,
  persistRunArtifact,
  persistSystemEvent,
} from "../observability.js";
import type {
  EasyApplyAnsweredQuestion,
  EasyApplyBatchEvent,
  EasyApplyDriver,
  EasyApplyExternalApplicationHandoff,
  EasyApplyRunResult,
  EasyApplyStepReport,
} from "../../linkedin/easyApply.js";
import { resolveLinkedInExternalApplyUrl } from "../../linkedin/easyApply.js";
import {
  runExternalApplyDryRunFlow,
  runExternalApplyFlow,
} from "./externalApplyFlows.js";

type EasyApplyArgs = Extract<CliArgs, { mode: "easy-apply" }>;
type EasyApplyBatchArgs = Extract<CliArgs, { mode: "easy-apply-batch" }>;
type ApplyArgs = Extract<CliArgs, { mode: "apply" }>;
type ApplyBatchArgs = Extract<CliArgs, { mode: "apply-batch" }>;
type LinkedInApplyArgs = EasyApplyArgs | ApplyArgs;
type LinkedInApplyBatchArgs = EasyApplyBatchArgs | ApplyBatchArgs;
type LinkedInApplyFlowArgs = LinkedInApplyArgs | LinkedInApplyBatchArgs;
type EasyApplyRunType =
  | "easy-apply"
  | "easy-apply-dry-run"
  | "easy-apply-batch"
  | "apply"
  | "apply-dry-run"
  | "apply-batch";

interface LinkedInApplyFlowOptions {
  enableExternalApplyHandoff?: boolean;
}

const DETECTED_ALREADY_APPLIED_REASON =
  "Detected LinkedIn applied badge; application was already submitted outside the bot.";

function isAlreadyAppliedSingleRun(result: { alreadyApplied?: boolean }): boolean {
  return result.alreadyApplied === true;
}

function isAlreadyAppliedBatchJob(job: {
  evaluation: { alreadyApplied?: boolean };
}): boolean {
  return job.evaluation.alreadyApplied === true;
}

function isBatchDryRunArgs(
  args: LinkedInApplyFlowArgs,
): args is LinkedInApplyBatchArgs {
  return args.mode === "easy-apply-batch" || args.mode === "apply-batch";
}

function collectAnsweredQuestions(steps: EasyApplyStepReport[]): EasyApplyAnsweredQuestion[] {
  return steps.flatMap((step) => step.questions ?? []);
}

function buildPreparedSurveyPayload(steps: EasyApplyStepReport[]) {
  const answeredQuestions = collectAnsweredQuestions(steps);
  if (answeredQuestions.length === 0) {
    return null;
  }

  return {
    questions: answeredQuestions.map((entry) => entry.question),
    answers: answeredQuestions.map((entry, index) => ({
      order: index,
      question: entry.question,
      resolved: entry.resolved,
      filled: entry.filled,
      ...(entry.details ? { details: entry.details } : {}),
    })),
  };
}

async function createCandidateProfileSnapshotForSurvey(args: {
  profile: Awaited<ReturnType<AppDeps["loadCandidateMasterProfile"]>>;
  deps: AppDeps;
}) {
  return args.deps.prisma.candidateProfileSnapshot.create({
    data: {
      fullName: args.profile.fullName,
      linkedinUrl: args.profile.linkedinUrl ?? null,
      resumePath: args.profile.sourceMetadata.resumePath ?? null,
      profileJson: JSON.stringify(args.profile),
    },
  });
}

async function persistEasyApplySurveyAnswers(args: {
  results: Array<{ url: string; steps: EasyApplyStepReport[] }>;
  profile: Awaited<ReturnType<AppDeps["loadCandidateMasterProfile"]>>;
  runType: EasyApplyRunType;
  deps: AppDeps;
}) {
  const payloads = args.results
    .map((result) => ({
      url: result.url,
      payload: buildPreparedSurveyPayload(result.steps),
    }))
    .filter((entry): entry is { url: string; payload: NonNullable<ReturnType<typeof buildPreparedSurveyPayload>> } => entry.payload != null);

  if (payloads.length === 0) {
    return [];
  }

  const snapshot = await createCandidateProfileSnapshotForSurvey({
    profile: args.profile,
    deps: args.deps,
  });

  const preparedAnswerSets = [];
  for (const entry of payloads) {
    const jobPostingId = args.deps.prisma.jobPosting.findUnique
      ? (await args.deps.prisma.jobPosting.findUnique({
          where: { url: entry.url },
          select: { id: true },
        }))?.id ?? null
      : null;
    const preparedAnswerSet = await args.deps.prisma.preparedAnswerSet.create({
      data: {
        ...(jobPostingId ? { jobPostingId } : {}),
        candidateProfileId: snapshot.id,
        questionsJson: JSON.stringify(entry.payload.questions),
        answersJson: JSON.stringify({
          sourceUrl: entry.url,
          runType: args.runType,
          answers: entry.payload.answers,
        }),
      },
    });
    preparedAnswerSets.push(preparedAnswerSet);
  }

  await persistSystemEvent(
    {
      level: "INFO",
      scope: "linkedin.easy_apply",
      message: "Easy Apply survey answers saved.",
      runType: args.runType,
      details: {
        candidateProfileSnapshotId: snapshot.id,
        preparedAnswerSetCount: preparedAnswerSets.length,
      },
    },
    args.deps,
  );

  return preparedAnswerSets;
}

async function persistDetectedAppliedJob(args: {
  url: string;
  source: EasyApplyRunType;
  deps: AppDeps;
  page: Parameters<AppDeps["extractJobText"]>[0];
}) {
  const latestReview = await getLatestJobReview({
    prisma: args.deps.prisma,
    jobUrl: args.url,
    logger: args.deps.logger,
  });

  const existingJobPosting = args.deps.prisma.jobPosting.findUnique
    ? await args.deps.prisma.jobPosting.findUnique({
        where: { url: args.url },
        select: {
          id: true,
          title: true,
          company: true,
          companyLogoUrl: true,
          companyLinkedinUrl: true,
          location: true,
        },
      })
    : null;

  const extracted = await args.deps.extractJobText(args.page, args.url);

  if (existingJobPosting && jobPostingNeedsMetadataRefresh(existingJobPosting)) {
    await refreshJobPostingMetadata({
      prisma: args.deps.prisma as never,
      logger: args.deps.logger,
      url: args.url,
      extracted,
    });
  }

  const alreadyPersistedAsApplied =
    latestReview?.status === "SUBMITTED" && latestReview.decision === "APPLY";

  if (alreadyPersistedAsApplied) {
    return;
  }

  const persisted = await persistDetectedAppliedJobRecord({
    prisma: args.deps.prisma as never,
    logger: args.deps.logger,
    url: args.url,
    extracted,
    reason: DETECTED_ALREADY_APPLIED_REASON,
  });

  await persistJobHistory(
    {
      jobPostingId: persisted.jobPosting.id,
      jobUrl: args.url,
      source: args.source,
      status: "SUBMITTED",
      score: 0,
      decision: "APPLY",
      policyAllowed: true,
      reasons: [DETECTED_ALREADY_APPLIED_REASON],
      summary: DETECTED_ALREADY_APPLIED_REASON,
      ...(extracted.platform ? { platform: extracted.platform } : {}),
      details: {
        detectedFrom: "linkedin_applied_badge",
        submittedByBot: false,
      },
    },
    args.deps,
  );

  await persistSystemEvent(
    {
      level: "INFO",
      scope: "linkedin.easy_apply",
      message: "Detected previously applied LinkedIn job.",
      runType: args.source,
      jobUrl: args.url,
      details: {
        submittedByBot: false,
        detectedFrom: "linkedin_applied_badge",
      },
    },
    args.deps,
  );
}

function getEasyApplyRunType(args: LinkedInApplyFlowArgs): EasyApplyRunType {
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

function getBatchPersistenceSource(
  args: EasyApplyBatchArgs | ApplyBatchArgs,
): "easy-apply-batch" | "apply-batch" {
  return args.mode === "apply-batch" ? "apply-batch" : "easy-apply-batch";
}

function getBatchCompletionLabel(args: EasyApplyBatchArgs | ApplyBatchArgs): string {
  return args.mode === "apply-batch"
    ? "LinkedIn Apply batch finished"
    : "LinkedIn Easy Apply batch finished";
}

function buildLinkedInSingleRunMeta(args: {
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

function buildLinkedInBatchRunMeta(args: {
  mode: "easy-apply-batch" | "apply-batch";
  dryRun: boolean;
  collectionUrl: string;
  durationMs: number;
  result: Awaited<ReturnType<typeof ensureBatchJobProcessingResults>>["result"];
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

async function continueExternalApplyFromLinkedIn(args: {
  runType: EasyApplyRunType;
  resumePath: string;
  easyApplyResult: EasyApplyRunResult;
  driver?: EasyApplyDriver;
  deps: AppDeps;
}): Promise<EasyApplyExternalApplicationHandoff | null> {
  if (args.easyApplyResult.status !== "stopped_external_apply") {
    return null;
  }

  const rawExternalApplyUrl = args.easyApplyResult.externalApplyUrl;
  const canonicalUrl = resolveLinkedInExternalApplyUrl(rawExternalApplyUrl);
  if (!rawExternalApplyUrl || !canonicalUrl) {
    return null;
  }

  const handoffScope =
    args.runType === "easy-apply-batch" ? "linkedin.batch" : "linkedin.easy_apply";
  const handoffRunType = args.runType.endsWith("dry-run") ? "dry-run" : "submit";

  await persistSystemEvent(
    {
      level: "INFO",
      scope: handoffScope,
      message: "Starting LinkedIn external apply handoff.",
      runType: args.runType,
      jobUrl: args.easyApplyResult.url,
      details: {
        rawExternalApplyUrl,
        canonicalUrl,
      },
    },
    args.deps,
  );

  if (!/^https?:\/\//i.test(canonicalUrl)) {
    return {
      sourceUrl: args.easyApplyResult.url,
      externalApplyUrl: rawExternalApplyUrl,
      canonicalUrl,
      runType: handoffRunType,
      status: "failed",
      stopReason: "Resolved external application URL was not a valid http(s) URL.",
    };
  }

  try {
    const externalArgs = {
      mode: "external-apply" as const,
      url: canonicalUrl,
      resumePath: args.resumePath,
      dryRun: handoffRunType === "dry-run",
    };
    const externalResult =
      handoffRunType === "dry-run"
        ? await runExternalApplyDryRunFlow(externalArgs, args.deps, {
            originalJobUrl: args.easyApplyResult.url,
          })
        : await runExternalApplyFlow(externalArgs, args.deps, {
            originalJobUrl: args.easyApplyResult.url,
          });

    const handoff: EasyApplyExternalApplicationHandoff = {
      sourceUrl: args.easyApplyResult.url,
      externalApplyUrl: rawExternalApplyUrl,
      canonicalUrl,
      runType: handoffRunType,
      status: "completed",
      finalStage: externalResult.finalStage,
      stopReason: externalResult.stopReason,
      platform: externalResult.discovery.platform,
      reportPath: externalResult.reportPath,
    };

    await persistSystemEvent(
      {
        level: "INFO",
        scope: handoffScope,
        message: "LinkedIn external apply handoff finished.",
        runType: args.runType,
        jobUrl: args.easyApplyResult.url,
        details: {
          canonicalUrl,
          finalStage: handoff.finalStage,
          platform: handoff.platform,
          reportPath: handoff.reportPath,
        },
      },
      args.deps,
    );

    if (
      handoffRunType === "submit" &&
      handoff.finalStage === "completed" &&
      args.driver?.confirmExternalApplicationFinished
    ) {
      try {
        const confirmed = await args.driver.confirmExternalApplicationFinished();
        await persistSystemEvent(
          {
            level: confirmed ? "INFO" : "WARN",
            scope: handoffScope,
            message: confirmed
              ? "Confirmed external application completion on LinkedIn."
              : "LinkedIn external completion prompt was not found after submit.",
            runType: args.runType,
            jobUrl: args.easyApplyResult.url,
            details: {
              canonicalUrl,
              confirmed,
            },
          },
          args.deps,
        );
      } catch (error) {
        args.deps.logger.warn(
          {
            event: "linkedin.external_apply_confirmation.failed",
            jobUrl: args.easyApplyResult.url,
            canonicalUrl,
            error: serializeError(error),
          },
          "LinkedIn external application completion confirmation failed",
        );
        await persistSystemEvent(
          {
            level: "WARN",
            scope: handoffScope,
            message: "LinkedIn external completion prompt confirmation failed.",
            runType: args.runType,
            jobUrl: args.easyApplyResult.url,
            details: {
              canonicalUrl,
              error: serializeError(error),
            },
          },
          args.deps,
        );
      }
    }

    return handoff;
  } catch (error) {
    const stopReason = error instanceof Error ? error.message : String(error);
    args.deps.logger.error(
      {
        event: "linkedin.external_apply_handoff.failed",
        jobUrl: args.easyApplyResult.url,
        externalApplyUrl: rawExternalApplyUrl,
        canonicalUrl,
        error: serializeError(error),
      },
      "LinkedIn external apply handoff failed",
    );
    await persistSystemEvent(
      {
        level: "ERROR",
        scope: handoffScope,
        message: "LinkedIn external apply handoff failed.",
        runType: args.runType,
        jobUrl: args.easyApplyResult.url,
        details: {
          rawExternalApplyUrl,
          canonicalUrl,
          error: serializeError(error),
        },
      },
      args.deps,
    );

    return {
      sourceUrl: args.easyApplyResult.url,
      externalApplyUrl: rawExternalApplyUrl,
      canonicalUrl,
      runType: handoffRunType,
      status: "failed",
      stopReason,
    };
  }
}

function createBatchEventObserver(args: {
  deps: AppDeps;
  runType: EasyApplyRunType;
}) {
  return async (event: EasyApplyBatchEvent) => {
    switch (event.type) {
      case "collection_opened":
        await persistSystemEvent(
          {
            level: "INFO",
            scope: "linkedin.batch",
            message: "Opened LinkedIn collection page for batch processing.",
            runType: args.runType,
            jobUrl: event.collectionUrl,
            details: {
              pageNumber: event.pageNumber,
            },
          },
          args.deps,
        );
        return;
      case "job_discovered":
        await persistSystemEvent(
          {
            level: "INFO",
            scope: "linkedin.batch",
            message: "Discovered job on LinkedIn collection page.",
            runType: args.runType,
            jobUrl: event.jobUrl,
            details: {
              collectionUrl: event.collectionUrl,
              pageNumber: event.pageNumber,
              alreadyApplied: event.alreadyApplied,
            },
          },
          args.deps,
        );
        return;
      case "job_evaluated":
        await persistSystemEvent(
          {
            level: "INFO",
            scope: "linkedin.batch",
            message: "Recorded batch decision for job.",
            runType: args.runType,
            jobUrl: event.jobUrl,
            details: {
              collectionUrl: event.collectionUrl,
              pageNumber: event.pageNumber,
              finalDecision: event.evaluation.finalDecision,
              shouldApply: event.evaluation.shouldApply,
              score: event.evaluation.score,
              decisionReason: event.evaluation.reason,
              policyAllowed: event.evaluation.policyAllowed,
              alreadyApplied: event.evaluation.alreadyApplied ?? false,
              diagnostics: event.evaluation.diagnostics ?? null,
            },
          },
          args.deps,
        );
        return;
      case "job_processing_started":
        await persistSystemEvent(
          {
            level: "INFO",
            scope: "linkedin.batch",
            message: "Starting application processing for approved job.",
            runType: args.runType,
            jobUrl: event.jobUrl,
            details: {
              collectionUrl: event.collectionUrl,
              pageNumber: event.pageNumber,
              attemptIndex: event.attemptIndex,
              finalDecision: event.evaluation.finalDecision,
              decisionReason: event.evaluation.reason,
              applicationType: event.evaluation.diagnostics?.applicationType ?? null,
            },
          },
          args.deps,
        );
        return;
      case "job_processing_finished":
        args.deps.logger.info(
          {
            jobUrl: event.jobUrl,
            collectionUrl: event.collectionUrl,
            pageNumber: event.pageNumber,
            attemptIndex: event.attemptIndex,
            finalDecision: event.evaluation.finalDecision,
            resultStatus: event.result.status,
            stopReason: event.result.stopReason,
            stepCount: event.result.steps.length,
            externalApplyUrl: event.result.externalApplyUrl ?? null,
          },
          "Finished application processing for approved job",
        );
        await persistSystemEvent(
          {
            level: "INFO",
            scope: "linkedin.batch",
            message: "Finished application processing for approved job.",
            runType: args.runType,
            jobUrl: event.jobUrl,
            details: {
              collectionUrl: event.collectionUrl,
              pageNumber: event.pageNumber,
              attemptIndex: event.attemptIndex,
              finalDecision: event.evaluation.finalDecision,
              resultStatus: event.result.status,
              stopReason: event.result.stopReason,
              stepCount: event.result.steps.length,
              externalApplyUrl: event.result.externalApplyUrl ?? null,
            },
          },
          args.deps,
        );
        return;
      case "job_processing_failed":
        args.deps.logger.error(
          {
            jobUrl: event.jobUrl,
            collectionUrl: event.collectionUrl,
            pageNumber: event.pageNumber,
            attemptIndex: event.attemptIndex,
            finalDecision: event.evaluation.finalDecision,
            error: event.error,
          },
          "Application processing failed for approved job",
        );
        await persistSystemEvent(
          {
            level: "ERROR",
            scope: "linkedin.batch",
            message: "Application processing failed for approved job.",
            runType: args.runType,
            jobUrl: event.jobUrl,
            details: {
              collectionUrl: event.collectionUrl,
              pageNumber: event.pageNumber,
              attemptIndex: event.attemptIndex,
              finalDecision: event.evaluation.finalDecision,
              error: event.error,
            },
          },
          args.deps,
        );
        return;
      case "job_processing_recovered":
        await persistSystemEvent(
          {
            level: event.recovered ? "INFO" : "ERROR",
            scope: "linkedin.batch",
            message: event.recovered
              ? "Recovered batch context after job processing failure."
              : "Failed to recover batch context after job processing failure.",
            runType: args.runType,
            jobUrl: event.jobUrl,
            details: {
              collectionUrl: event.collectionUrl,
              pageNumber: event.pageNumber,
              attemptIndex: event.attemptIndex,
              recovered: event.recovered,
              message: event.message,
            },
          },
          args.deps,
        );
        return;
      case "page_advanced":
        await persistSystemEvent(
          {
            level: "INFO",
            scope: "linkedin.batch",
            message: "Advanced to the next LinkedIn collection page.",
            runType: args.runType,
            jobUrl: event.collectionUrl,
            details: {
              pageNumber: event.pageNumber,
            },
          },
          args.deps,
        );
        return;
    }
  };
}

async function runLinkedInDryRunFlow(
  args: LinkedInApplyFlowArgs,
  deps: AppDeps,
  options: LinkedInApplyFlowOptions = {},
) {
  const startedAt = performance.now();
  const runType = getEasyApplyRunType(args);
  const isBatchRun = isBatchDryRunArgs(args);
  const profile = await loadMasterProfileForArgs(args, deps);
  const scoringProfile = await deps.loadCandidateProfile();
  const resolveCandidateAnswer = createCandidateAnswerResolver(profile, deps);

  let result;
  let reportPath: string | undefined;
  try {
    result = await deps.withPage(
      LINKEDIN_BROWSER_SESSION_OPTIONS,
      async (page) => {
        const driver = await deps.createEasyApplyDriver(page);
        const evaluationPage = isBatchRun
          ? args.disableAiEvaluation
            ? undefined
            : await page.context().newPage()
          : await page.context().newPage();
        const evaluateJob = createBatchJobEvaluator({
          disableAiEvaluation: isBatchRun ? args.disableAiEvaluation : true,
          scoreThreshold: isBatchRun ? args.scoreThreshold : 0,
          useAiScoreAdjustment: isBatchRun ? args.useAiScoreAdjustment : false,
          allowExternalLinkedInApply:
            args.mode === "apply" || args.mode === "apply-batch",
          scoringProfile,
          ...(evaluationPage ? { evaluationPage } : {}),
          deps,
        });
        const observeBatchEvent = createBatchEventObserver({
          deps,
          runType,
        });
        const sharedInput = {
          driver,
          url: args.url,
          candidateProfile: profile,
          evaluateJob,
          resolveAnswer: resolveCandidateAnswer,
          observeBatchEvent,
        };

        try {
          if (isBatchRun) {
            const batchResult = await deps.runEasyApplyBatchDryRun({
              ...sharedInput,
              targetCount: args.count,
            });

            for (const job of batchResult.jobs) {
              if (!isAlreadyAppliedBatchJob(job)) {
                continue;
              }

              await persistDetectedAppliedJob({
                url: job.url,
                source: runType,
                deps,
                page: evaluationPage ?? page,
              });
            }

            for (const job of batchResult.jobs) {
              if (!job.result) {
                continue;
              }

              if (options.enableExternalApplyHandoff) {
                const externalApplication = await continueExternalApplyFromLinkedIn({
                  runType,
                  resumePath: args.resumePath,
                  easyApplyResult: job.result,
                  driver,
                  deps,
                });
                if (externalApplication) {
                  job.result = {
                    ...job.result,
                    externalApplication,
                  };
                }
              }
            }

            return batchResult;
          }

          let singleResult = await deps.runEasyApplyDryRun(sharedInput);
          if (isAlreadyAppliedSingleRun(singleResult)) {
            await persistDetectedAppliedJob({
              url: args.url,
              source: runType,
              deps,
              page,
            });
          }

          if (options.enableExternalApplyHandoff) {
            const externalApplication = await continueExternalApplyFromLinkedIn({
              runType,
              resumePath: args.resumePath,
              easyApplyResult: singleResult,
              driver,
              deps,
            });
            if (externalApplication) {
              singleResult = {
                ...singleResult,
                externalApplication,
              };
            }
          }

          return singleResult;
        } finally {
          await evaluationPage?.close().catch(() => undefined);
        }
      },
    );
  } catch (error) {
    deps.logger.error(
      {
        event: "linkedin.easy_apply.failed",
        url: args.url,
        error: serializeError(error),
      },
      "LinkedIn Easy Apply run failed",
    );
    throw new AppError({
      message: "LinkedIn Easy Apply flow failed.",
      phase: "linkedin_easy_apply",
      code: "LINKEDIN_EASY_APPLY_FAILED",
      cause: error,
      details: { url: args.url },
    });
  }

  await persistSystemEvent(
    {
      level: "INFO",
      scope: "linkedin.easy_apply",
      message: "LinkedIn Easy Apply dry run finished.",
      runType,
      jobUrl: args.url,
      details:
        "jobs" in result
          ? {
              status: result.status,
              requestedCount: result.requestedCount,
              attemptedCount: result.attemptedCount,
              evaluatedCount: result.evaluatedCount,
              skippedCount: result.skippedCount,
            }
          : {
              status: result.status,
              stepCount: result.steps.length,
              stopReason: result.stopReason,
            },
    },
    deps,
  );

  deps.logger.info(
    "jobs" in result
      ? {
          status: result.status,
          attemptedCount: result.attemptedCount,
          evaluatedCount: result.evaluatedCount,
          skippedCount: result.skippedCount,
          requestedCount: result.requestedCount,
          pagesVisited: result.pagesVisited,
          disableAiEvaluation: isBatchRun ? args.disableAiEvaluation : true,
          scoreThreshold: isBatchRun ? args.scoreThreshold : 0,
          useAiScoreAdjustment: isBatchRun ? args.useAiScoreAdjustment : false,
          stopReason: result.stopReason,
        }
      : {
          status: result.status,
          stepCount: result.steps.length,
          stopReason: result.stopReason,
          ...(result.reviewDiagnostics
            ? { reviewDiagnostics: result.reviewDiagnostics }
            : {}),
          ...(result.externalApplyUrl
            ? { externalApplyUrl: result.externalApplyUrl }
            : {}),
          ...(result.externalApplication
            ? { externalApplication: result.externalApplication }
            : {}),
        },
    "LinkedIn Easy Apply dry run finished",
  );

  if ("jobs" in result) {
    const normalizedBatch = ensureBatchJobProcessingResults(result);
    result = normalizedBatch.result;
    for (const jobUrl of normalizedBatch.synthesizedJobUrls) {
      deps.logger.error(
        {
          jobUrl,
          collectionUrl: args.url,
          reason: "approved_job_missing_processing_result",
        },
        "Approved batch job lost its processing result; synthesized a failure result",
      );
    }
    await persistBatchRunAnomalies(
      {
        runType: "easy-apply-dry-run",
        collectionUrl: args.url,
        result,
      },
      deps,
    );
    await persistBatchJobHistory(
      {
        source: "easy-apply-dry-run",
        threshold: isBatchRun ? args.scoreThreshold : 0,
        jobs: result.jobs,
      },
      deps,
    );
    reportPath = await persistRunArtifact({
      category: "batch-runs",
      prefix: "easy-apply-dry-run",
      payload: {
        mode: args.mode,
        dryRun: true,
        url: args.url,
        disableAiEvaluation: isBatchRun ? args.disableAiEvaluation : true,
        scoreThreshold: isBatchRun ? args.scoreThreshold : 0,
        useAiScoreAdjustment: isBatchRun ? args.useAiScoreAdjustment : false,
        result,
        meta: buildLinkedInBatchRunMeta({
          mode: args.mode as "easy-apply-batch" | "apply-batch",
          dryRun: true,
          collectionUrl: args.url,
          durationMs: Math.round(performance.now() - startedAt),
          result,
        }),
      },
      deps,
    });
  }

  const response = {
    mode: args.mode,
    dryRun: true,
    profile,
    easyApply: result,
    ...(reportPath ? { reportPath } : {}),
  };

  if (!("jobs" in result)) {
    const preparedAnswerSets = await persistEasyApplySurveyAnswers({
      results: [{ url: result.url, steps: result.steps }],
      profile,
      runType,
      deps,
    });
    if (!isAlreadyAppliedSingleRun(result)) {
      await persistJobHistory(
        {
          jobUrl: args.url,
          source: runType,
          status: mapCombinedEasyApplyResultToHistoryStatus(result),
          reasons: [result.stopReason],
          summary: result.stopReason,
          details: {
            stepCount: result.steps.length,
            ...(result.externalApplyUrl
              ? { externalApplyUrl: result.externalApplyUrl }
              : {}),
            ...(result.externalApplication
              ? {
                  externalApplication: {
                    canonicalUrl: result.externalApplication.canonicalUrl,
                    status: result.externalApplication.status,
                    finalStage: result.externalApplication.finalStage ?? null,
                    stopReason: result.externalApplication.stopReason ?? null,
                    platform: result.externalApplication.platform ?? null,
                    reportPath: result.externalApplication.reportPath ?? null,
                  },
                }
              : {}),
          },
        },
        deps,
      );
    }
    reportPath = await persistRunArtifact({
      category: "easy-apply-runs",
      prefix: "easy-apply-dry-run",
      payload: {
        ...response,
        meta: buildLinkedInSingleRunMeta({
          mode: args.mode as "easy-apply" | "apply",
          dryRun: true,
          url: args.url,
          durationMs: Math.round(performance.now() - startedAt),
          result,
        }),
      },
      deps,
    });
    return {
      ...response,
      ...(preparedAnswerSets.length > 0 ? { preparedAnswerSets } : {}),
      reportPath,
    };
  }

  const preparedAnswerSets = await persistEasyApplySurveyAnswers({
    results: result.jobs
      .filter((job): job is typeof job & { result: EasyApplyRunResult } => job.result != null)
      .map((job) => ({ url: job.url, steps: job.result.steps })),
    profile,
    runType,
    deps,
  });

  return {
    ...response,
    ...(preparedAnswerSets.length > 0 ? { preparedAnswerSets } : {}),
  };
}

async function runLinkedInSingleFlow(
  args: LinkedInApplyArgs,
  deps: AppDeps,
  options: LinkedInApplyFlowOptions = {},
) {
  const startedAt = performance.now();
  const runType = getEasyApplyRunType(args);
  const profile = await loadMasterProfileForArgs(args, deps);
  const resolveCandidateAnswer = createCandidateAnswerResolver(profile, deps);

  let result;
  let reportPath: string;
  try {
    result = await deps.withPage(
      LINKEDIN_BROWSER_SESSION_OPTIONS,
      async (page) => {
        const driver = await deps.createEasyApplyDriver(page);
        let singleResult = await deps.runEasyApply({
          driver,
          url: args.url,
          candidateProfile: profile,
          resolveAnswer: resolveCandidateAnswer,
        });

        if (isAlreadyAppliedSingleRun(singleResult)) {
            await persistDetectedAppliedJob({
              url: args.url,
            source: runType,
            deps,
            page,
          });
        }

        if (options.enableExternalApplyHandoff) {
          const externalApplication = await continueExternalApplyFromLinkedIn({
            runType,
            resumePath: args.resumePath,
            easyApplyResult: singleResult,
            driver,
            deps,
          });
          if (externalApplication) {
            singleResult = {
              ...singleResult,
              externalApplication,
            };
          }
        }

        return singleResult;
      },
    );
  } catch (error) {
    deps.logger.error(
      {
        event: "linkedin.easy_apply.failed",
        url: args.url,
        error: serializeError(error),
      },
      "LinkedIn Easy Apply run failed",
    );
    throw new AppError({
      message: "LinkedIn Easy Apply flow failed.",
      phase: "linkedin_easy_apply",
      code: "LINKEDIN_EASY_APPLY_FAILED",
      cause: error,
      details: { url: args.url },
    });
  }

  await persistSystemEvent(
    {
      level: "INFO",
      scope: "linkedin.easy_apply",
      message: "LinkedIn Easy Apply finished.",
      runType,
      jobUrl: args.url,
      details: {
        status: result.status,
        stopReason: result.stopReason,
        stepCount: result.steps.length,
      },
    },
    deps,
  );
  if (!isAlreadyAppliedSingleRun(result)) {
    await persistJobHistory(
      {
        jobUrl: args.url,
        source: runType,
        status: mapCombinedEasyApplyResultToHistoryStatus(result),
        reasons: [result.stopReason],
        summary: result.stopReason,
        details: {
          stepCount: result.steps.length,
          ...(result.externalApplyUrl
            ? { externalApplyUrl: result.externalApplyUrl }
            : {}),
          ...(result.externalApplication
            ? {
                externalApplication: {
                  canonicalUrl: result.externalApplication.canonicalUrl,
                  status: result.externalApplication.status,
                  finalStage: result.externalApplication.finalStage ?? null,
                  stopReason: result.externalApplication.stopReason ?? null,
                  platform: result.externalApplication.platform ?? null,
                  reportPath: result.externalApplication.reportPath ?? null,
                },
              }
            : {}),
        },
      },
      deps,
    );
  }

  deps.logger.info(
    {
      status: result.status,
      stepCount: result.steps.length,
      stopReason: result.stopReason,
      ...(result.reviewDiagnostics
        ? { reviewDiagnostics: result.reviewDiagnostics }
        : {}),
      ...(result.externalApplyUrl
        ? { externalApplyUrl: result.externalApplyUrl }
        : {}),
      ...(result.externalApplication
        ? { externalApplication: result.externalApplication }
        : {}),
    },
    "LinkedIn Easy Apply finished",
  );

  reportPath = await persistRunArtifact({
    category: "easy-apply-runs",
    prefix: args.mode,
    payload: {
      mode: args.mode,
      dryRun: false,
      url: args.url,
      result,
      meta: buildLinkedInSingleRunMeta({
        mode: args.mode,
        dryRun: false,
        url: args.url,
        durationMs: Math.round(performance.now() - startedAt),
        result,
      }),
    },
    deps,
  });

  const preparedAnswerSets = await persistEasyApplySurveyAnswers({
    results: [{ url: result.url, steps: result.steps }],
    profile,
    runType,
    deps,
  });

  return {
    mode: args.mode,
    dryRun: false,
    profile,
    easyApply: result,
    ...(preparedAnswerSets.length > 0 ? { preparedAnswerSets } : {}),
    reportPath,
  };
}

async function runLinkedInBatchFlow(
  args: LinkedInApplyBatchArgs,
  deps: AppDeps,
  options: LinkedInApplyFlowOptions = {},
) {
  const startedAt = performance.now();
  const runType = getEasyApplyRunType(args);
  const profile = await loadMasterProfileForArgs(args, deps);
  const scoringProfile = await deps.loadCandidateProfile();
  const resolveCandidateAnswer = createCandidateAnswerResolver(profile, deps);

  let result;
  let reportPath: string;
  try {
    result = await deps.withPage(
      LINKEDIN_BROWSER_SESSION_OPTIONS,
      async (page) => {
        const driver = await deps.createEasyApplyDriver(page);
        const evaluationPage = args.disableAiEvaluation
          ? undefined
          : await page.context().newPage();
        const evaluateJob = createBatchJobEvaluator({
          disableAiEvaluation: args.disableAiEvaluation,
          scoreThreshold: args.scoreThreshold,
          useAiScoreAdjustment: args.useAiScoreAdjustment,
          allowExternalLinkedInApply: args.mode === "apply-batch",
          scoringProfile,
          ...(evaluationPage ? { evaluationPage } : {}),
          deps,
        });
        const observeBatchEvent = createBatchEventObserver({
          deps,
          runType,
        });

        try {
          const batchResult = await deps.runEasyApplyBatch({
            driver,
            url: args.url,
            targetCount: args.count,
            candidateProfile: profile,
            evaluateJob,
            resolveAnswer: resolveCandidateAnswer,
            observeBatchEvent,
          });

          for (const job of batchResult.jobs) {
            if (!isAlreadyAppliedBatchJob(job)) {
              continue;
            }

            await persistDetectedAppliedJob({
              url: job.url,
              source: runType,
              deps,
              page: evaluationPage ?? page,
            });
          }

          for (const job of batchResult.jobs) {
            if (!job.result) {
              continue;
            }

            if (options.enableExternalApplyHandoff) {
              const externalApplication = await continueExternalApplyFromLinkedIn({
                runType,
                resumePath: args.resumePath,
                easyApplyResult: job.result,
                driver,
                deps,
              });
              if (externalApplication) {
                job.result = {
                  ...job.result,
                  externalApplication,
                };
              }
            }
          }

          return batchResult;
        } finally {
          await evaluationPage?.close().catch(() => undefined);
        }
      },
    );
  } catch (error) {
    deps.logger.error(
      {
        event: "linkedin.easy_apply.failed",
        url: args.url,
        error: serializeError(error),
      },
      "LinkedIn Easy Apply run failed",
    );
    throw new AppError({
      message: "LinkedIn Easy Apply flow failed.",
      phase: "linkedin_easy_apply",
      code: "LINKEDIN_EASY_APPLY_FAILED",
      cause: error,
      details: { url: args.url },
    });
  }

  await persistSystemEvent(
    {
      level: "INFO",
      scope: "linkedin.batch",
      message: "LinkedIn Easy Apply batch finished.",
      runType,
      jobUrl: args.url,
      details: {
        status: result.status,
        requestedCount: result.requestedCount,
        attemptedCount: result.attemptedCount,
        evaluatedCount: result.evaluatedCount,
        skippedCount: result.skippedCount,
      },
    },
    deps,
  );
  const normalizedBatch = ensureBatchJobProcessingResults(result);
  result = normalizedBatch.result;
  for (const jobUrl of normalizedBatch.synthesizedJobUrls) {
    deps.logger.error(
      {
        jobUrl,
        collectionUrl: args.url,
        reason: "approved_job_missing_processing_result",
      },
      "Approved batch job lost its processing result; synthesized a failure result",
    );
  }
  await persistBatchRunAnomalies(
    {
      runType: getBatchPersistenceSource(args),
      collectionUrl: args.url,
      result,
    },
    deps,
  );
  await persistBatchJobHistory(
    {
      source: getBatchPersistenceSource(args),
      threshold: args.scoreThreshold,
      jobs: result.jobs,
    },
    deps,
  );

  deps.logger.info(
    {
      status: result.status,
      attemptedCount: result.attemptedCount,
      evaluatedCount: result.evaluatedCount,
      skippedCount: result.skippedCount,
      requestedCount: result.requestedCount,
      pagesVisited: result.pagesVisited,
      disableAiEvaluation: args.disableAiEvaluation,
      scoreThreshold: args.scoreThreshold,
      useAiScoreAdjustment: args.useAiScoreAdjustment,
      stopReason: result.stopReason,
    },
    getBatchCompletionLabel(args),
  );

  reportPath = await persistRunArtifact({
      category: "batch-runs",
      prefix: args.mode,
      payload: {
        mode: args.mode,
        dryRun: false,
        url: args.url,
      disableAiEvaluation: args.disableAiEvaluation,
      scoreThreshold: args.scoreThreshold,
      useAiScoreAdjustment: args.useAiScoreAdjustment,
      result,
      meta: buildLinkedInBatchRunMeta({
        mode: args.mode,
        dryRun: false,
        collectionUrl: args.url,
        durationMs: Math.round(performance.now() - startedAt),
        result,
      }),
    },
    deps,
  });

  const preparedAnswerSets = await persistEasyApplySurveyAnswers({
    results: result.jobs
      .filter((job): job is typeof job & { result: EasyApplyRunResult } => job.result != null)
      .map((job) => ({ url: job.url, steps: job.result.steps })),
    profile,
    runType,
    deps,
  });

  return {
    mode: args.mode,
    dryRun: false,
    profile,
    easyApply: result,
    ...(preparedAnswerSets.length > 0 ? { preparedAnswerSets } : {}),
    reportPath,
  };
}

export async function runLinkedInEasyApplyDryRunFlow(
  args: EasyApplyArgs | EasyApplyBatchArgs,
  deps: AppDeps,
) {
  return runLinkedInDryRunFlow(args, deps);
}

export async function runLinkedInApplyDryRunFlow(
  args: ApplyArgs | ApplyBatchArgs,
  deps: AppDeps,
) {
  return runLinkedInDryRunFlow(args, deps, {
    enableExternalApplyHandoff: true,
  });
}

export async function runLinkedInEasyApplyFlow(
  args: EasyApplyArgs,
  deps: AppDeps,
) {
  return runLinkedInSingleFlow(args, deps);
}

export async function runLinkedInApplyFlow(
  args: ApplyArgs,
  deps: AppDeps,
) {
  return runLinkedInSingleFlow(args, deps, {
    enableExternalApplyHandoff: true,
  });
}

export async function runLinkedInEasyApplyBatchFlow(
  args: EasyApplyBatchArgs,
  deps: AppDeps,
) {
  return runLinkedInBatchFlow(args, deps);
}

export async function runLinkedInApplyBatchFlow(
  args: ApplyBatchArgs,
  deps: AppDeps,
) {
  return runLinkedInBatchFlow(args, deps, {
    enableExternalApplyHandoff: true,
  });
}
