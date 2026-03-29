import { AppError, serializeError } from "../../utils/errors.js";
import { getLatestJobReview } from "../../utils/jobHistory.js";
import {
  jobPostingNeedsMetadataRefresh,
  persistDetectedAppliedJobRecord,
  refreshJobPostingMetadata,
} from "../../utils/jobPersistence.js";
import type { CliArgs } from "../cli.js";
import { isLinkedInCollectionUrl, LINKEDIN_BROWSER_SESSION_OPTIONS } from "../constants.js";
import type { AppDeps } from "../deps.js";
import {
  createBatchJobEvaluator,
  createCandidateAnswerResolver,
  loadMasterProfileForArgs,
} from "../flowHelpers.js";
import {
  mapEasyApplyStatusToHistoryStatus,
  persistBatchJobHistory,
  persistJobHistory,
  persistRunArtifact,
  persistSystemEvent,
} from "../observability.js";
import type {
  EasyApplyAnsweredQuestion,
  EasyApplyRunResult,
  EasyApplyStepReport,
} from "../../linkedin/easyApply.js";

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
  runType: "easy-apply" | "easy-apply-dry-run" | "easy-apply-batch";
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
    const preparedAnswerSet = await args.deps.prisma.preparedAnswerSet.create({
      data: {
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
  source: "easy-apply" | "easy-apply-dry-run" | "easy-apply-batch";
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

export async function runEasyApplyDryRunFlow(
  args: Extract<CliArgs, { mode: "easy-apply-dry-run" }>,
  deps: AppDeps,
) {
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
        const evaluationPage = args.disableAiEvaluation
          ? undefined
          : await page.context().newPage();
        const evaluateJob = createBatchJobEvaluator({
          disableAiEvaluation: args.disableAiEvaluation,
          scoreThreshold: args.scoreThreshold,
          useAiScoreAdjustment: args.useAiScoreAdjustment,
          scoringProfile,
          ...(evaluationPage ? { evaluationPage } : {}),
          deps,
        });
        const sharedInput = {
          driver,
          url: args.url,
          candidateProfile: profile,
          evaluateJob,
          resolveAnswer: resolveCandidateAnswer,
        };

        try {
          if (args.count > 1 || isLinkedInCollectionUrl(args.url)) {
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
                source: args.mode,
                deps,
                page: evaluationPage ?? page,
              });
            }

            return batchResult;
          }

          const singleResult = await deps.runEasyApplyDryRun(sharedInput);
          if (isAlreadyAppliedSingleRun(singleResult)) {
            await persistDetectedAppliedJob({
              url: args.url,
              source: args.mode,
              deps,
              page,
            });
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
      runType: args.mode,
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
          disableAiEvaluation: args.disableAiEvaluation,
          scoreThreshold: args.scoreThreshold,
          useAiScoreAdjustment: args.useAiScoreAdjustment,
          stopReason: result.stopReason,
        }
      : {
          status: result.status,
          stepCount: result.steps.length,
          stopReason: result.stopReason,
          ...(result.reviewDiagnostics
            ? { reviewDiagnostics: result.reviewDiagnostics }
            : {}),
        },
    "LinkedIn Easy Apply dry run finished",
  );

  if ("jobs" in result) {
    await persistBatchJobHistory(
      {
        source: "easy-apply-dry-run",
        threshold: args.scoreThreshold,
        jobs: result.jobs,
      },
      deps,
    );
    reportPath = await persistRunArtifact({
      category: "batch-runs",
      prefix: "easy-apply-dry-run",
      payload: {
        mode: args.mode,
        url: args.url,
        disableAiEvaluation: args.disableAiEvaluation,
        scoreThreshold: args.scoreThreshold,
        useAiScoreAdjustment: args.useAiScoreAdjustment,
        result,
      },
      deps,
    });
  }

  const response = {
    mode: args.mode,
    profile,
    easyApply: result,
    ...(reportPath ? { reportPath } : {}),
  };

  if (!("jobs" in result)) {
    const preparedAnswerSets = await persistEasyApplySurveyAnswers({
      results: [{ url: result.url, steps: result.steps }],
      profile,
      runType: args.mode,
      deps,
    });
    if (!isAlreadyAppliedSingleRun(result)) {
      await persistJobHistory(
        {
          jobUrl: args.url,
          source: args.mode,
          status: mapEasyApplyStatusToHistoryStatus(result.status),
          reasons: [result.stopReason],
          summary: result.stopReason,
          details: {
            stepCount: result.steps.length,
          },
        },
        deps,
      );
    }
    reportPath = await persistRunArtifact({
      category: "easy-apply-runs",
      prefix: "easy-apply-dry-run",
      payload: response,
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
    runType: args.mode,
    deps,
  });

  return {
    ...response,
    ...(preparedAnswerSets.length > 0 ? { preparedAnswerSets } : {}),
  };
}

export async function runEasyApplyFlow(
  args: Extract<CliArgs, { mode: "easy-apply" }>,
  deps: AppDeps,
) {
  const profile = await loadMasterProfileForArgs(args, deps);
  const resolveCandidateAnswer = createCandidateAnswerResolver(profile, deps);

  let result;
  let reportPath: string;
  try {
    result = await deps.withPage(
      LINKEDIN_BROWSER_SESSION_OPTIONS,
      async (page) => {
        const driver = await deps.createEasyApplyDriver(page);
        const singleResult = await deps.runEasyApply({
          driver,
          url: args.url,
          candidateProfile: profile,
          resolveAnswer: resolveCandidateAnswer,
        });

        if (isAlreadyAppliedSingleRun(singleResult)) {
          await persistDetectedAppliedJob({
            url: args.url,
            source: args.mode,
            deps,
            page,
          });
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
      runType: args.mode,
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
        source: args.mode,
        status: mapEasyApplyStatusToHistoryStatus(result.status),
        reasons: [result.stopReason],
        summary: result.stopReason,
        details: {
          stepCount: result.steps.length,
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
    },
    "LinkedIn Easy Apply finished",
  );

  reportPath = await persistRunArtifact({
    category: "easy-apply-runs",
    prefix: args.mode,
    payload: {
      mode: args.mode,
      url: args.url,
      result,
    },
    deps,
  });

  const preparedAnswerSets = await persistEasyApplySurveyAnswers({
    results: [{ url: result.url, steps: result.steps }],
    profile,
    runType: args.mode,
    deps,
  });

  return {
    mode: args.mode,
    profile,
    easyApply: result,
    ...(preparedAnswerSets.length > 0 ? { preparedAnswerSets } : {}),
    reportPath,
  };
}

export async function runEasyApplyBatchFlow(
  args: Extract<CliArgs, { mode: "easy-apply-batch" }>,
  deps: AppDeps,
) {
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
          scoringProfile,
          ...(evaluationPage ? { evaluationPage } : {}),
          deps,
        });

        try {
          const batchResult = await deps.runEasyApplyBatch({
            driver,
            url: args.url,
            targetCount: args.count,
            candidateProfile: profile,
            evaluateJob,
            resolveAnswer: resolveCandidateAnswer,
          });

          for (const job of batchResult.jobs) {
            if (!isAlreadyAppliedBatchJob(job)) {
              continue;
            }

            await persistDetectedAppliedJob({
              url: job.url,
              source: args.mode,
              deps,
              page: evaluationPage ?? page,
            });
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
      runType: args.mode,
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
  await persistBatchJobHistory(
    {
      source: "easy-apply-batch",
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
    "LinkedIn Easy Apply batch finished",
  );

  reportPath = await persistRunArtifact({
    category: "batch-runs",
    prefix: "easy-apply-batch",
    payload: {
      mode: args.mode,
      url: args.url,
      disableAiEvaluation: args.disableAiEvaluation,
      scoreThreshold: args.scoreThreshold,
      useAiScoreAdjustment: args.useAiScoreAdjustment,
      result,
    },
    deps,
  });

  const preparedAnswerSets = await persistEasyApplySurveyAnswers({
    results: result.jobs
      .filter((job): job is typeof job & { result: EasyApplyRunResult } => job.result != null)
      .map((job) => ({ url: job.url, steps: job.result.steps })),
    profile,
    runType: args.mode,
    deps,
  });

  return {
    mode: args.mode,
    profile,
    easyApply: result,
    ...(preparedAnswerSets.length > 0 ? { preparedAnswerSets } : {}),
    reportPath,
  };
}
