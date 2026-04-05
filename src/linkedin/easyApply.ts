import type { CandidateProfile } from "../candidate/types.js";
import type { InputQuestion } from "../questions/types.js";
import type { ResolvedAnswer } from "../answers/types.js";
import {
  getErrorMessage,
  serializeError,
  type SerializableError,
} from "../utils/errors.js";
import type { SiteFeedbackSnapshot } from "../browser/siteFeedback.js";
import { repairAnswerFromSiteFeedback } from "../questions/strategies/aiCorrection.js";

export type EasyApplyPrimaryAction = "next" | "review" | "submit" | "unknown";

export interface EasyApplyQuestionView extends InputQuestion {
  fieldKey: string;
  required: boolean;
  currentValue?: string | null;
  isPrefilled?: boolean;
  expectsDecimal?: boolean;
  validationMessage?: string | null;
}

export interface EasyApplyAnsweredQuestion {
  question: EasyApplyQuestionView;
  resolved: ResolvedAnswer;
  filled: boolean;
  details?: string;
  aiCorrectionAttempt?: {
    validationFeedback: string;
    previousAnswer: unknown;
    correctedAnswer: unknown;
    outcome: "same_answer" | "retry_succeeded" | "retry_failed" | "repair_failed";
    finalFeedback?: string | null;
  };
}

export interface EasyApplyStepReport {
  stepIndex: number;
  questions: EasyApplyAnsweredQuestion[];
  action: EasyApplyPrimaryAction;
  stateSnapshot?: EasyApplyStepStateSnapshot;
  siteFeedback?: SiteFeedbackSnapshot;
}

export interface EasyApplyStepStateSnapshot {
  modalTitle: string | null;
  headingText: string | null;
  primaryAction: EasyApplyPrimaryAction;
  buttonLabels: string[];
}

export interface EasyApplyReviewDiagnostics {
  validationMessages: string[];
  blockingFields: Array<{
    fieldKey: string;
    label: string;
    validationMessage?: string | null;
    currentValue?: string | null;
    required: boolean;
  }>;
  buttonStates: Array<{
    action: "next" | "review" | "submit";
    visible: boolean;
    disabled: boolean;
    label: string | null;
  }>;
}

export interface EasyApplyExternalApplicationHandoff {
  sourceUrl: string;
  externalApplyUrl: string;
  canonicalUrl: string;
  runType: "dry-run" | "submit";
  status: "completed" | "failed";
  finalStage?: string;
  stopReason?: string;
  platform?: string;
  reportPath?: string;
}

export interface EasyApplyExternalDetection {
  source: "explicit_company_website_cta" | "header_apply_fallback";
  signals: string[];
}

export interface EasyApplyRunResult {
  status:
    | "submitted"
    | "ready_to_submit"
    | "stopped_manual_review"
    | "stopped_external_apply"
    | "stopped_not_easy_apply"
    | "stopped_unknown_action";
  steps: EasyApplyStepReport[];
  stopReason: string;
  url: string;
  externalApplyUrl?: string;
  externalDetection?: EasyApplyExternalDetection;
  externalApplication?: EasyApplyExternalApplicationHandoff;
  reviewDiagnostics?: EasyApplyReviewDiagnostics;
  siteFeedback?: SiteFeedbackSnapshot;
  alreadyApplied?: boolean;
  error?: SerializableError;
  recovery?: {
    attempted: boolean;
    succeeded: boolean;
    message: string;
  };
}

export interface EasyApplyJobEvaluation {
  shouldApply: boolean;
  finalDecision: "APPLY" | "MAYBE" | "SKIP";
  score: number;
  reason: string;
  policyAllowed: boolean;
  alreadyApplied?: boolean;
  error?: SerializableError;
  diagnostics?: {
    title?: string | null;
    company?: string | null;
    location?: string | null;
    companyLinkedinUrl?: string | null;
    applicationType?: string | null;
    companyInfoRead?: boolean;
    metadataRead?: boolean;
  };
}

export interface EasyApplyBatchJobResult {
  url: string;
  evaluation: EasyApplyJobEvaluation;
  result?: EasyApplyRunResult;
}

export interface EasyApplyCollectionJob {
  url: string;
  alreadyApplied: boolean;
}

export interface EasyApplyBatchRunResult {
  status: "completed" | "partial" | "stopped_no_jobs";
  collectionUrl: string;
  requestedCount: number;
  attemptedCount: number;
  evaluatedCount: number;
  skippedCount: number;
  pagesVisited: number;
  jobs: EasyApplyBatchJobResult[];
  stopReason: string;
}

export interface EasyApplyDriver {
  open(url: string): Promise<void>;
  openCollection(url: string): Promise<void>;
  ensureAuthenticated(url: string): Promise<void>;
  isEasyApplyAvailable(): Promise<boolean>;
  isExternalApplyAvailable?(): Promise<boolean>;
  getExternalApplyUrl?(): Promise<string | null>;
  getExternalApplyDetection?(): Promise<EasyApplyExternalDetection | null>;
  isAlreadyApplied?(): Promise<boolean>;
  openEasyApply(): Promise<void>;
  collectQuestions(): Promise<EasyApplyQuestionView[]>;
  collectVisibleJobs?(): Promise<EasyApplyCollectionJob[]>;
  collectVisibleJobUrls?(): Promise<string[]>;
  goToNextResultsPage(): Promise<boolean>;
  collectStepState?(): Promise<EasyApplyStepStateSnapshot>;
  collectReviewDiagnostics?(): Promise<EasyApplyReviewDiagnostics>;
  collectSiteFeedback?(): Promise<SiteFeedbackSnapshot>;
  fillAnswer(
    question: EasyApplyQuestionView,
    resolved: ResolvedAnswer,
  ): Promise<{ filled: boolean; details?: string }>;
  getPrimaryAction(): Promise<EasyApplyPrimaryAction>;
  advance(action: "next" | "review" | "submit"): Promise<void>;
  dismissCompletionModal?(): Promise<boolean>;
  confirmExternalApplicationFinished?(): Promise<boolean>;
}

interface EasyApplyRunInput {
  driver: EasyApplyDriver;
  url: string;
  candidateProfile: CandidateProfile;
  resolveAnswer: (args: {
    question: InputQuestion;
    candidateProfile: CandidateProfile;
  }) => Promise<ResolvedAnswer>;
  maxSteps?: number;
}

export interface EasyApplyBatchRunInput {
  driver: EasyApplyDriver;
  url: string;
  targetCount: number;
  candidateProfile: CandidateProfile;
  evaluateJob: (url: string) => Promise<EasyApplyJobEvaluation>;
  resolveAnswer: (args: {
    question: InputQuestion;
    candidateProfile: CandidateProfile;
  }) => Promise<ResolvedAnswer>;
  maxSteps?: number;
  observeBatchEvent?: (event: EasyApplyBatchEvent) => Promise<void> | void;
}

export type EasyApplyBatchEvent =
  | {
      type: "collection_opened";
      collectionUrl: string;
      pageNumber: number;
    }
  | {
      type: "job_discovered";
      collectionUrl: string;
      jobUrl: string;
      pageNumber: number;
      alreadyApplied: boolean;
    }
  | {
      type: "job_evaluated";
      collectionUrl: string;
      jobUrl: string;
      pageNumber: number;
      evaluation: EasyApplyJobEvaluation;
    }
  | {
      type: "job_processing_started";
      collectionUrl: string;
      jobUrl: string;
      pageNumber: number;
      attemptIndex: number;
      evaluation: EasyApplyJobEvaluation;
    }
  | {
      type: "job_processing_finished";
      collectionUrl: string;
      jobUrl: string;
      pageNumber: number;
      attemptIndex: number;
      evaluation: EasyApplyJobEvaluation;
      result: EasyApplyRunResult;
    }
  | {
      type: "job_processing_failed";
      collectionUrl: string;
      jobUrl: string;
      pageNumber: number;
      attemptIndex: number;
      evaluation: EasyApplyJobEvaluation;
      error: SerializableError;
    }
  | {
      type: "job_processing_recovered";
      collectionUrl: string;
      jobUrl: string;
      pageNumber: number;
      attemptIndex: number;
      recovered: boolean;
      message: string;
    }
  | {
      type: "page_advanced";
      collectionUrl: string;
      pageNumber: number;
    };

interface PreparedStepQuestionResult {
  answeredQuestion: EasyApplyAnsweredQuestion;
  hasRequiredManualReview: boolean;
}

interface StepExecutionResult {
  report: EasyApplyStepReport;
  hasRequiredManualReview: boolean;
  stepSignature: string;
  siteFeedback?: SiteFeedbackSnapshot;
}

type SubmitMode = "dry-run" | "submit";

export function resolveLinkedInExternalApplyUrl(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  if (!/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  try {
    const parsed = new URL(normalized);
    const wrappedTarget = parsed.searchParams.get("url");
    return wrappedTarget ? wrappedTarget : parsed.toString();
  } catch {
    return normalized;
  }
}

function formatErrorForJobProcessing(error: unknown): {
  summary: string;
  serialized: SerializableError;
} {
  const serialized = serializeError(error);
  const chain: SerializableError[] = [];
  let current: SerializableError | undefined = serialized;
  while (current) {
    chain.push(current);
    current = current.cause;
  }

  const head = chain[0] ?? serialized;
  const parts = [
    head.phase ? `phase=${head.phase}` : null,
    head.code ? `code=${head.code}` : null,
    head.message ? `message=${head.message}` : null,
  ].filter(Boolean);

  const detailParts = Object.entries(head.details ?? {})
    .filter(([, value]) =>
      typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    )
    .slice(0, 6)
    .map(([key, value]) => `${key}=${String(value)}`);
  if (detailParts.length > 0) {
    parts.push(`details(${detailParts.join(", ")})`);
  }

  if (chain.length > 1) {
    const causeSummary = chain
      .slice(1)
      .map((entry) => {
        const causeParts = [
          entry.phase ? `phase=${entry.phase}` : null,
          entry.code ? `code=${entry.code}` : null,
          entry.message,
        ].filter(Boolean);
        return causeParts.join(" ");
      })
      .join(" | cause: ");
    parts.push(`cause: ${causeSummary}`);
  }

  return {
    summary: parts.join("; "),
    serialized,
  };
}

function buildJobProcessingFailure(
  url: string,
  error: unknown,
  recovery?: EasyApplyRunResult["recovery"],
): EasyApplyRunResult {
  const formatted = formatErrorForJobProcessing(error);
  return {
    status: "stopped_unknown_action",
    steps: [],
    stopReason: `Job processing failed: ${formatted.summary || getErrorMessage(error)}`,
    url,
    error: formatted.serialized,
    ...(recovery ? { recovery } : {}),
  };
}

function buildAlreadyAppliedBatchResult(url: string): EasyApplyBatchJobResult {
  return {
    url,
    evaluation: {
      shouldApply: false,
      finalDecision: "SKIP",
      score: 0,
      reason: "Job already has a LinkedIn applied badge.",
      policyAllowed: true,
      alreadyApplied: true,
    },
  };
}

function buildEvaluationFailureResult(url: string, error: unknown): EasyApplyBatchJobResult {
  const formatted = formatErrorForJobProcessing(error);
  return {
    url,
    evaluation: {
      shouldApply: false,
      finalDecision: "SKIP",
      score: 0,
      reason: `Job evaluation failed: ${formatted.summary || getErrorMessage(error)}`,
      policyAllowed: false,
      error: formatted.serialized,
    },
  };
}

async function collectVisibleBatchJobs(
  driver: EasyApplyDriver,
): Promise<EasyApplyCollectionJob[]> {
  if (driver.collectVisibleJobs) {
    return driver.collectVisibleJobs();
  }

  return ((await driver.collectVisibleJobUrls?.()) ?? []).map((url) => ({
    url,
    alreadyApplied: false,
  }));
}

async function processApprovedBatchJob(
  input: EasyApplyBatchRunInput,
  url: string,
  submitMode: SubmitMode,
): Promise<EasyApplyRunResult> {
  return runEasyApplyInternal(
    {
      driver: input.driver,
      url,
      candidateProfile: input.candidateProfile,
      resolveAnswer: input.resolveAnswer,
      ...(input.maxSteps ? { maxSteps: input.maxSteps } : {}),
    },
    submitMode,
  );
}

async function recoverBatchAfterJobFailure(
  input: EasyApplyBatchRunInput,
  failedJobUrl: string,
): Promise<NonNullable<EasyApplyRunResult["recovery"]>> {
  try {
    await input.driver.ensureAuthenticated(input.url);
    await input.driver.openCollection(input.url);
    return {
      attempted: true,
      succeeded: true,
      message: `Recovered batch context after failure on ${failedJobUrl} by reopening the LinkedIn collection.`,
    };
  } catch (recoveryError) {
    const recoveryMessage = getErrorMessage(recoveryError);
    return {
      attempted: true,
      succeeded: false,
      message:
        `Failed to recover batch context after failure on ${failedJobUrl}: ${recoveryMessage}`,
    };
  }
}

function createSkippedAnswer(
  question: EasyApplyQuestionView,
  details: string,
  notes: string[],
): EasyApplyAnsweredQuestion {
  return {
    question,
    resolved: {
      questionType: "contact_info",
      strategy: "deterministic",
      answer: question.currentValue ?? null,
      confidence: 0.99,
      confidenceLabel: "high",
      source: "candidate-profile",
      notes,
    },
    filled: true,
    details,
  };
}

export function isManualReviewAnswer(answer: ResolvedAnswer): boolean {
  return (
    answer.strategy === "needs-review" ||
    answer.confidenceLabel === "manual_review"
  );
}

export function isSubmitButtonLabel(label: string): boolean {
  return label.trim().toLowerCase() === "submit application";
}

export function isAutoHandledQuestion(
  question: EasyApplyQuestionView,
): boolean {
  return (
    question.inputType === "file" ||
    /(?:select|deselect|upload)\s+(?:resume|cv)\b/i.test(question.label)
  );
}

export function chooseRadioValue(
  options: string[],
  answer: ResolvedAnswer["answer"],
): string | null {
  const normalizedOptions = options.map((option) => option.trim());
  if (typeof answer === "boolean") {
    const wanted = answer ? ["yes", "true"] : ["no", "false"];
    return (
      normalizedOptions.find((option) =>
        wanted.includes(option.toLowerCase()),
      ) ?? null
    );
  }

  if (typeof answer === "string") {
    const exact = normalizedOptions.find(
      (option) => option.toLowerCase() === answer.trim().toLowerCase(),
    );
    if (exact) {
      return exact;
    }

    return (
      normalizedOptions.find((option) =>
        option.toLowerCase().includes(answer.trim().toLowerCase()),
      ) ?? null
    );
  }

  return null;
}

async function stopIfApplyUnavailable(
  driver: EasyApplyDriver,
  url: string,
): Promise<EasyApplyRunResult | null> {
  if (await driver.isEasyApplyAvailable()) {
    return null;
  }

  const externalApplyAvailable =
    (await driver.isExternalApplyAvailable?.()) === true;
  const externalDetection = externalApplyAvailable
    ? ((await driver.getExternalApplyDetection?.()) ?? undefined)
    : undefined;
  const externalApplyUrl = externalApplyAvailable
    ? (resolveLinkedInExternalApplyUrl(
        (await driver.getExternalApplyUrl?.()) ?? undefined,
      ) ?? undefined)
    : undefined;

  if ((await driver.isAlreadyApplied?.()) === true) {
    return {
      status: "stopped_not_easy_apply",
      steps: [],
      stopReason: "This LinkedIn job has already been applied to.",
      url,
      alreadyApplied: true,
    };
  }

  if (externalApplyAvailable) {
    return {
      status: "stopped_external_apply",
      steps: [],
      stopReason:
        "This LinkedIn job redirects to an external application page.",
      url,
      ...(externalApplyUrl ? { externalApplyUrl } : {}),
      ...(externalDetection ? { externalDetection } : {}),
    };
  }

  return {
    status: "stopped_not_easy_apply",
    steps: [],
    stopReason: "Easy Apply button was not found on the page.",
    url,
  };
}

async function prepareQuestionAnswer(args: {
  question: EasyApplyQuestionView;
  input: EasyApplyRunInput;
}): Promise<PreparedStepQuestionResult> {
  const { question, input } = args;

  if (isAutoHandledQuestion(question)) {
    return {
      answeredQuestion: createSkippedAnswer(
        question,
        "Skipped because LinkedIn already manages the resume/document field.",
        [
          "Skipped because LinkedIn handles resume/document selection on this step.",
        ],
      ),
      hasRequiredManualReview: false,
    };
  }

  if (question.isPrefilled) {
    return {
      answeredQuestion: createSkippedAnswer(
        question,
        "Skipped because LinkedIn already pre-filled this field.",
        ["Skipped because LinkedIn already pre-filled this field."],
      ),
      hasRequiredManualReview: false,
    };
  }

  const resolved = await input.resolveAnswer({
    question,
    candidateProfile: input.candidateProfile,
  });

  if (question.required && isManualReviewAnswer(resolved)) {
    return {
      answeredQuestion: {
        question,
        resolved,
        filled: false,
        details: "Required question needs manual review.",
      },
      hasRequiredManualReview: true,
    };
  }

  // Keep the originally resolved answer unless the site rejects it and AI produces a better retry value.
  let finalResolved = resolved;
  let aiCorrectionAttempt: EasyApplyAnsweredQuestion["aiCorrectionAttempt"];
  let filled = isManualReviewAnswer(resolved)
    ? {
        filled: false,
        details: "Skipped because it is marked for manual review.",
      }
    : await input.driver.fillAnswer(question, resolved);

  if (!filled.filled && filled.details && !isManualReviewAnswer(resolved)) {
    const validationFeedback = filled.details;
    const corrected = await repairAnswerFromSiteFeedback({
      question,
      candidateProfile: input.candidateProfile,
      previousAnswer: resolved,
      validationFeedback,
    }).catch(() => null);

    if (!corrected) {
      aiCorrectionAttempt = {
        validationFeedback,
        previousAnswer: resolved.answer,
        correctedAnswer: null,
        outcome: "repair_failed",
      };
    }

    if (
      corrected &&
      corrected.answer != null &&
      JSON.stringify(corrected.answer) !== JSON.stringify(resolved.answer)
    ) {
      const correctedFill = await input.driver.fillAnswer(question, corrected);
      finalResolved = corrected;
      filled = correctedFill.filled
        ? {
            filled: true,
            details: "Filled successfully after AI corrected the value using site feedback.",
          }
        : correctedFill;
      aiCorrectionAttempt = {
        validationFeedback,
        previousAnswer: resolved.answer,
        correctedAnswer: corrected.answer,
        outcome: correctedFill.filled ? "retry_succeeded" : "retry_failed",
        ...(correctedFill.filled ? {} : { finalFeedback: correctedFill.details ?? null }),
      };
    } else if (corrected) {
      aiCorrectionAttempt = {
        validationFeedback,
        previousAnswer: resolved.answer,
        correctedAnswer: corrected.answer,
        outcome: "same_answer",
        finalFeedback: validationFeedback,
      };
    }
  }

  return {
    answeredQuestion: {
      question,
      resolved: finalResolved,
      filled: filled.filled,
      ...(filled.details ? { details: filled.details } : {}),
      ...(aiCorrectionAttempt ? { aiCorrectionAttempt } : {}),
    },
    hasRequiredManualReview: question.required && !filled.filled,
  };
}

// Executes one Easy Apply step end-to-end: collect visible questions, answer them, and snapshot the surface state.
async function executeStep(args: {
  input: EasyApplyRunInput;
  stepIndex: number;
}): Promise<StepExecutionResult> {
  const questions = await args.input.driver.collectQuestions();
  const answeredQuestions: EasyApplyAnsweredQuestion[] = [];
  let hasRequiredManualReview = false;

  for (const question of questions) {
    const prepared = await prepareQuestionAnswer({
      question,
      input: args.input,
    });
    answeredQuestions.push(prepared.answeredQuestion);
    hasRequiredManualReview =
      hasRequiredManualReview || prepared.hasRequiredManualReview;
  }

  const siteFeedback = await args.input.driver.collectSiteFeedback?.();
  const stateSnapshot = await args.input.driver.collectStepState?.();
  const action = stateSnapshot?.primaryAction ?? await args.input.driver.getPrimaryAction();
  const stepSignature = JSON.stringify({
    questions: questions.map((question) => ({
      key: question.fieldKey,
      label: question.label,
      required: question.required,
    })),
    stateSnapshot: stateSnapshot ?? null,
    action,
  });

  return {
    report: {
      stepIndex: args.stepIndex,
      questions: answeredQuestions,
      action,
      ...(stateSnapshot ? { stateSnapshot } : {}),
      ...(siteFeedback && siteFeedback.messages.length > 0 ? { siteFeedback } : {}),
    },
    hasRequiredManualReview,
    stepSignature,
    ...(siteFeedback && siteFeedback.messages.length > 0 ? { siteFeedback } : {}),
  };
}

// Main provider-agnostic Easy Apply loop shared by dry-run and live submission modes.
async function runEasyApplyInternal(
  input: EasyApplyRunInput,
  submitMode: SubmitMode,
): Promise<EasyApplyRunResult> {
  const maxSteps = input.maxSteps ?? 10;

  await input.driver.ensureAuthenticated(input.url);
  await input.driver.open(input.url);

  const unavailableResult = await stopIfApplyUnavailable(
    input.driver,
    input.url,
  );
  if (unavailableResult) {
    return unavailableResult;
  }

  await input.driver.openEasyApply();

  const steps: EasyApplyStepReport[] = [];
  let lastStepSignature: string | null = null;
  let latestSiteFeedback: SiteFeedbackSnapshot | undefined;

  for (let stepIndex = 0; stepIndex < maxSteps; stepIndex += 1) {
    const step = await executeStep({ input, stepIndex });
    steps.push(step.report);
    if (step.siteFeedback && step.siteFeedback.messages.length > 0) {
      latestSiteFeedback = step.siteFeedback;
    }

    if (step.report.action === "submit") {
      if (submitMode === "dry-run") {
        return {
          status: "ready_to_submit",
          steps,
          stopReason:
            "Reached the final submit step. Dry run stops before submission.",
          url: input.url,
          ...(latestSiteFeedback ? { siteFeedback: latestSiteFeedback } : {}),
        };
      }

      if (step.hasRequiredManualReview) {
        return {
          status: "stopped_manual_review",
          steps,
          stopReason:
            "A required Easy Apply question needs manual review before submitting.",
          url: input.url,
          ...(latestSiteFeedback ? { siteFeedback: latestSiteFeedback } : {}),
        };
      }

      await input.driver.advance("submit");
      await input.driver.dismissCompletionModal?.();

      return {
        status: "submitted",
        steps,
        stopReason: "Application submitted successfully.",
        url: input.url,
        ...(latestSiteFeedback ? { siteFeedback: latestSiteFeedback } : {}),
      };
    }

    if (step.report.action === "review") {
      if (lastStepSignature === step.stepSignature) {
        const reviewDiagnostics =
          await input.driver.collectReviewDiagnostics?.();
        return {
          status: step.hasRequiredManualReview
            ? "stopped_manual_review"
            : "stopped_unknown_action",
          steps,
          stopReason: step.hasRequiredManualReview
            ? "Review step did not advance because required questions still need review or valid input."
            : "Review step repeated without advancing.",
          url: input.url,
          ...(reviewDiagnostics ? { reviewDiagnostics } : {}),
          ...(latestSiteFeedback ? { siteFeedback: latestSiteFeedback } : {}),
        };
      }

      lastStepSignature = step.stepSignature;
      await input.driver.advance("review");
      continue;
    }

    if (step.hasRequiredManualReview) {
      return {
        status: "stopped_manual_review",
        steps,
        stopReason: "A required Easy Apply question needs manual review.",
        url: input.url,
        ...(latestSiteFeedback ? { siteFeedback: latestSiteFeedback } : {}),
      };
    }

    if (step.report.action === "next") {
      lastStepSignature = step.stepSignature;
      await input.driver.advance("next");
      continue;
    }

    return {
      status: "stopped_unknown_action",
      steps,
      stopReason: "Could not determine the next Easy Apply action.",
      url: input.url,
      ...(latestSiteFeedback ? { siteFeedback: latestSiteFeedback } : {}),
    };
  }

  return {
    status: "stopped_unknown_action",
    steps,
    stopReason: `Exceeded the Easy Apply step limit of ${maxSteps}.`,
    url: input.url,
    ...(latestSiteFeedback ? { siteFeedback: latestSiteFeedback } : {}),
  };
}

export async function runEasyApplyDryRun(
  input: EasyApplyRunInput,
): Promise<EasyApplyRunResult> {
  return runEasyApplyInternal(input, "dry-run");
}

export async function runEasyApplyBatchInternal(
  input: EasyApplyBatchRunInput,
  submitMode: SubmitMode,
): Promise<EasyApplyBatchRunResult> {
  const requestedCount = Math.max(1, Math.floor(input.targetCount));
  const seenUrls = new Set<string>();
  const jobs: EasyApplyBatchJobResult[] = [];
  let pagesVisited = 0;
  let skippedCount = 0;
  let attemptedCount = 0;
  let interruptedReason: string | null = null;

  await input.driver.ensureAuthenticated(input.url);
  await input.driver.openCollection(input.url);
  pagesVisited += 1;
  await input.observeBatchEvent?.({
    type: "collection_opened",
    collectionUrl: input.url,
    pageNumber: pagesVisited,
  });

  while (attemptedCount < requestedCount) {
    const visibleJobs = await collectVisibleBatchJobs(input.driver);

    for (const job of visibleJobs) {
      const { url, alreadyApplied } = job;
      if (seenUrls.has(url)) {
        continue;
      }

      seenUrls.add(url);
      await input.observeBatchEvent?.({
        type: "job_discovered",
        collectionUrl: input.url,
        jobUrl: url,
        pageNumber: pagesVisited,
        alreadyApplied,
      });

      if (alreadyApplied) {
        skippedCount += 1;
        const batchJob = buildAlreadyAppliedBatchResult(url);
        jobs.push(batchJob);
        await input.observeBatchEvent?.({
          type: "job_evaluated",
          collectionUrl: input.url,
          jobUrl: url,
          pageNumber: pagesVisited,
          evaluation: batchJob.evaluation,
        });
        continue;
      }

      let evaluation: EasyApplyJobEvaluation;
      try {
        evaluation = await input.evaluateJob(url);
      } catch (error) {
        skippedCount += 1;
        const failedEvaluation = buildEvaluationFailureResult(url, error);
        jobs.push(failedEvaluation);
        await input.observeBatchEvent?.({
          type: "job_evaluated",
          collectionUrl: input.url,
          jobUrl: url,
          pageNumber: pagesVisited,
          evaluation: failedEvaluation.evaluation,
        });
        continue;
      }
      await input.observeBatchEvent?.({
        type: "job_evaluated",
        collectionUrl: input.url,
        jobUrl: url,
        pageNumber: pagesVisited,
        evaluation,
      });

      if (!evaluation.shouldApply) {
        skippedCount += 1;
        jobs.push({ url, evaluation });
        continue;
      }

      const entry: EasyApplyBatchJobResult = { url, evaluation };
      jobs.push(entry);

      try {
        await input.observeBatchEvent?.({
          type: "job_processing_started",
          collectionUrl: input.url,
          jobUrl: url,
          pageNumber: pagesVisited,
          attemptIndex: attemptedCount + 1,
          evaluation,
        });
        entry.result = await processApprovedBatchJob(input, url, submitMode);
      } catch (error) {
        const serializedError = serializeError(error);
        await input.observeBatchEvent?.({
          type: "job_processing_failed",
          collectionUrl: input.url,
          jobUrl: url,
          pageNumber: pagesVisited,
          attemptIndex: attemptedCount + 1,
          evaluation,
          error: serializedError,
        });
        const recovery = await recoverBatchAfterJobFailure(input, url);
        await input.observeBatchEvent?.({
          type: "job_processing_recovered",
          collectionUrl: input.url,
          jobUrl: url,
          pageNumber: pagesVisited,
          attemptIndex: attemptedCount + 1,
          recovered: recovery.succeeded,
          message: recovery.message,
        });
        entry.result = buildJobProcessingFailure(url, error, recovery);
        if (!(recovery?.succeeded ?? false)) {
          interruptedReason = recovery?.message ?? "Batch recovery failed after job processing error.";
        }
      }
      await input.observeBatchEvent?.({
        type: "job_processing_finished",
        collectionUrl: input.url,
        jobUrl: url,
        pageNumber: pagesVisited,
        attemptIndex: attemptedCount + 1,
        evaluation,
        result: entry.result,
      });

      attemptedCount += 1;
      if (interruptedReason) {
        break;
      }
      if (attemptedCount >= requestedCount) {
        break;
      }
    }

    if (interruptedReason) {
      break;
    }
    if (attemptedCount >= requestedCount) {
      break;
    }

    const advanced = await input.driver.goToNextResultsPage();
    if (!advanced) {
      break;
    }

    pagesVisited += 1;
    await input.observeBatchEvent?.({
      type: "page_advanced",
      collectionUrl: input.url,
      pageNumber: pagesVisited,
    });
  }

  if (jobs.length === 0 && attemptedCount === 0) {
    return {
      status: "stopped_no_jobs",
      collectionUrl: input.url,
      requestedCount,
      attemptedCount: 0,
      evaluatedCount: 0,
      skippedCount: 0,
      pagesVisited,
      jobs: [],
      stopReason:
        "No LinkedIn Easy Apply jobs were discovered from the collection page.",
    };
  }

  const status = attemptedCount >= requestedCount ? "completed" : "partial";
  const approvedJobs = jobs.filter((job) => job.evaluation.shouldApply);
  const incompleteApprovedJobs = approvedJobs.filter((job) =>
    job.result != null &&
    job.result.status !== "submitted" &&
    job.result.status !== "ready_to_submit"
  );
  const stopReason =
    interruptedReason
      ? interruptedReason
      : status === "completed"
      ? `Processed ${attemptedCount} LinkedIn apply job(s).`
      : incompleteApprovedJobs.length > 0
        ? `Processed ${attemptedCount} approved LinkedIn apply job(s), but ${incompleteApprovedJobs.length} attempt(s) stopped before completion.`
        : `Only found and processed ${attemptedCount} matching LinkedIn apply job(s) before pagination ended.`;

  return {
    status,
    collectionUrl: input.url,
    requestedCount,
    attemptedCount,
    evaluatedCount: jobs.length,
    skippedCount,
    pagesVisited,
    jobs,
    stopReason,
  };
}

export async function runEasyApplyBatchDryRun(
  input: EasyApplyBatchRunInput,
): Promise<EasyApplyBatchRunResult> {
  return runEasyApplyBatchInternal(input, "dry-run");
}

export async function runEasyApplyBatch(
  input: EasyApplyBatchRunInput,
): Promise<EasyApplyBatchRunResult> {
  return runEasyApplyBatchInternal(input, "submit");
}
export async function runEasyApply(
  input: EasyApplyRunInput,
): Promise<EasyApplyRunResult> {
  return runEasyApplyInternal(input, "submit");
}
