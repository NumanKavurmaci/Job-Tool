import type { CandidateProfile } from "../candidate/types.js";
import type { InputQuestion } from "../questions/types.js";
import type { ResolvedAnswer } from "../answers/types.js";
import {
  AppError,
  getErrorMessage,
  serializeError,
  type SerializableError,
} from "../utils/errors.js";
import type { SiteFeedbackSnapshot } from "../browser/siteFeedback.js";
import { repairAnswerFromSiteFeedback } from "../questions/strategies/aiCorrection.js";
import {
  assertSafeLinkedInNavigationUrl,
  assertSafeNavigationUrl,
  isLinkedInHostname,
} from "../security/navigationSafety.js";

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

export interface EasyApplyUnknownActionDiagnostics {
  currentUrl?: string | null;
  activeElement?: {
    tagName: string;
    inputType: string | null;
    role: string | null;
    ariaLabel: string | null;
    placeholder: string | null;
    text: string | null;
  } | null;
  visibleButtonLabels: string[];
  modalHtmlSample?: string | null;
  overlayTextSample?: string | null;
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
  failureReasonCode?: string | null;
  retryable?: boolean;
  missingProfileData?: string[];
  platform?: string;
  reportPath?: string;
  error?: SerializableError;
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
  unknownActionDiagnostics?: EasyApplyUnknownActionDiagnostics;
  siteFeedback?: SiteFeedbackSnapshot;
  alreadyApplied?: boolean;
  error?: SerializableError;
  recovery?: {
    attempted: boolean;
    succeeded: boolean;
    message: string;
  };
  failureReasonCode?: string | null;
  retryable?: boolean;
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
    alreadyApplied?: boolean;
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

export type EasyApplyJobApplicationState =
  | "already_applied"
  | "apply_available"
  | "unknown";

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
  successfulCount?: number;
  paginationStopReason?: EasyApplyPaginationStopReason;
}

export type EasyApplyPaginationStopReasonCode =
  | "next_control_missing"
  | "next_control_disabled"
  | "next_control_click_failed"
  | "results_unchanged_timeout"
  | "driver_could_not_advance";

export interface EasyApplyPaginationStopReason {
  code: EasyApplyPaginationStopReasonCode;
  message: string;
}

export interface EasyApplyProcessingDriverLease {
  driver: EasyApplyDriver;
  dispose(): Promise<void>;
}

export interface EasyApplyDriver {
  open(url: string): Promise<void>;
  openCollection(url: string): Promise<void>;
  getCurrentCollectionUrl?(): string | null;
  ensureAuthenticated(url: string): Promise<void>;
  createProcessingDriver?(url: string): Promise<EasyApplyProcessingDriverLease>;
  resetAfterProcessingTimeout?(
    input?: EasyApplyProcessingTimeoutResetInput,
  ): Promise<void>;
  isEasyApplyAvailable(): Promise<boolean>;
  isExternalApplyAvailable?(): Promise<boolean>;
  getExternalApplyUrl?(): Promise<string | null>;
  getExternalApplyDetection?(): Promise<EasyApplyExternalDetection | null>;
  isAlreadyApplied?(): Promise<boolean>;
  inspectJobApplicationState?(url: string): Promise<EasyApplyJobApplicationState>;
  openEasyApply(): Promise<void>;
  collectQuestions(): Promise<EasyApplyQuestionView[]>;
  collectVisibleJobs?(): Promise<EasyApplyCollectionJob[]>;
  collectVisibleJobUrls?(): Promise<string[]>;
  goToNextResultsPage(): Promise<boolean>;
  getLastPaginationStopReason?(): EasyApplyPaginationStopReason | null;
  collectStepState?(): Promise<EasyApplyStepStateSnapshot>;
  collectReviewDiagnostics?(): Promise<EasyApplyReviewDiagnostics>;
  collectUnknownActionDiagnostics?(): Promise<EasyApplyUnknownActionDiagnostics>;
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
  jobProcessingTimeoutMs?: number;
  externalApplyInspectionTimeoutMs?: number;
  collectionContextTimeoutMs?: number;
  maxPages?: number;
  maxConsecutiveNoProgressPages?: number;
  continueExternalApplication?: (
    result: EasyApplyRunResult,
  ) => Promise<EasyApplyExternalApplicationHandoff | null>;
  observeBatchEvent?: (event: EasyApplyBatchEvent) => Promise<void> | void;
}

export interface EasyApplyProcessingTimeoutResetInput {
  waitForTimedOutOperations: () => Promise<void>;
  signal?: AbortSignal;
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
    }
  | {
      type: "pagination_stopped";
      collectionUrl: string;
      pageNumber: number;
      reason: EasyApplyPaginationStopReason;
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

const DEFAULT_JOB_PROCESSING_TIMEOUT_MS = 120_000;
const DEFAULT_EXTERNAL_APPLY_INSPECTION_TIMEOUT_MS = 5_000;
const DEFAULT_PROCESSING_TIMEOUT_RESET_MS = 15_000;
const DEFAULT_COLLECTION_RESTORE_TIMEOUT_MS = 75_000;
const DEFAULT_COLLECTION_RECOVERY_TIMEOUT_MS = 195_000;
const DEFAULT_BATCH_MAX_PAGES = 100;
const DEFAULT_BATCH_MAX_CONSECUTIVE_NO_PROGRESS_PAGES = 3;

class ApprovedJobProcessingTimeoutError extends AppError {
  constructor(
    readonly jobUrl: string,
    readonly timeoutMs: number,
    readonly waitForTimedOutOperations: () => Promise<void>,
  ) {
    super({
      message: `Approved LinkedIn job processing timed out after ${timeoutMs}ms for ${jobUrl}.`,
      phase: "linkedin_easy_apply",
      code: "LINKEDIN_APPROVED_JOB_PROCESSING_TIMEOUT",
      details: { jobUrl, timeoutMs },
    });
    this.name = "ApprovedJobProcessingTimeoutError";
  }
}

class ExternalApplyInspectionTimeoutError extends AppError {
  constructor(
    readonly jobUrl: string,
    readonly timeoutMs: number,
    readonly waitForTimedOutOperations: () => Promise<void>,
  ) {
    super({
      message:
        `LinkedIn external application inspection timed out after ${timeoutMs}ms for ${jobUrl}.`,
      phase: "linkedin_easy_apply",
      code: "LINKEDIN_EXTERNAL_APPLY_INSPECTION_TIMEOUT",
      details: { jobUrl, timeoutMs },
    });
    this.name = "ExternalApplyInspectionTimeoutError";
  }
}

class CollectionContextOperationTimeoutError extends AppError {
  constructor(
    readonly operation: "recovery" | "reset" | "restore",
    readonly jobUrl: string,
    readonly timeoutMs: number,
  ) {
    super({
      message:
        `LinkedIn collection context ${operation} timed out after ${timeoutMs}ms for ${jobUrl}.`,
      phase: "linkedin_easy_apply",
      code: "LINKEDIN_COLLECTION_CONTEXT_TIMEOUT",
      details: { operation, jobUrl, timeoutMs },
    });
    this.name = "CollectionContextOperationTimeoutError";
  }
}

function readPositiveInteger(
  value: number | undefined,
  fallback: number,
): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.max(1, Math.floor(value));
}

function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  createError: () => Error,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(createError());
    }, timeoutMs);

    operation.then(
      (value) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function getAbortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error("Approved LinkedIn job processing was aborted.");
}

function createAbortGuardedDriver(
  driver: EasyApplyDriver,
  signal: AbortSignal,
): {
  driver: EasyApplyDriver;
  waitForInFlightCalls: () => Promise<void>;
} {
  const inFlightCalls = new Set<Promise<unknown>>();
  const guardedDriver = new Proxy(driver, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== "function") {
        return value;
      }

      return (...args: unknown[]) => {
        if (signal.aborted) {
          return Promise.reject(getAbortReason(signal));
        }

        const operation = Promise.resolve()
          .then(() => Reflect.apply(value, target, args))
          .then((result) => {
            if (signal.aborted) {
              throw getAbortReason(signal);
            }
            return result;
          });
        inFlightCalls.add(operation);
        void operation.then(
          () => inFlightCalls.delete(operation),
          () => inFlightCalls.delete(operation),
        );
        return operation;
      };
    },
  });

  return {
    driver: guardedDriver,
    waitForInFlightCalls: async () => {
      await Promise.allSettled([...inFlightCalls]);
    },
  };
}

async function runBoundedCollectionContextOperation<T>(
  input: EasyApplyBatchRunInput,
  jobUrl: string,
  operation: "recovery" | "reset" | "restore",
  run: (driver: EasyApplyDriver, signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const timeoutMs = readPositiveInteger(
    input.collectionContextTimeoutMs,
    operation === "restore"
      ? DEFAULT_COLLECTION_RESTORE_TIMEOUT_MS
      : operation === "reset"
        ? DEFAULT_PROCESSING_TIMEOUT_RESET_MS
        : DEFAULT_COLLECTION_RECOVERY_TIMEOUT_MS,
  );
  const abortController = new AbortController();
  const guardedDriver = createAbortGuardedDriver(
    input.driver,
    abortController.signal,
  ).driver;

  return withTimeout(
    Promise.resolve().then(() => run(guardedDriver, abortController.signal)),
    timeoutMs,
    () => {
      const timeoutError = new CollectionContextOperationTimeoutError(
        operation,
        jobUrl,
        timeoutMs,
      );
      // A later-settling navigation may finish internally, but it cannot start
      // another driver call through this operation after the timeout boundary.
      abortController.abort(timeoutError);
      return timeoutError;
    },
  );
}

export function resolveLinkedInExternalApplyUrl(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  try {
    const parsed = assertSafeNavigationUrl(normalized, {
      requireHttps: true,
      context: "LinkedIn external application URL",
    });
    if (isLinkedInHostname(parsed.hostname)) {
      assertSafeLinkedInNavigationUrl(normalized, "LinkedIn external application URL");
    }

    const isLinkedInSafetyWrapper =
      isLinkedInHostname(parsed.hostname) &&
      /^\/safety\/go(?:\/|$)/i.test(parsed.pathname);
    const wrappedTarget = isLinkedInSafetyWrapper
      ? parsed.searchParams.get("url")?.trim()
      : null;
    if (!wrappedTarget) {
      return parsed.toString();
    }

    return assertSafeNavigationUrl(wrappedTarget, {
      requireHttps: true,
      context: "LinkedIn external application target",
    }).toString();
  } catch {
    return null;
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

function isEmptyUnknownStepState(
  state: EasyApplyStepStateSnapshot | undefined,
): boolean {
  return Boolean(
    state &&
      state.primaryAction === "unknown" &&
      !state.modalTitle &&
      !state.headingText &&
      state.buttonLabels.length === 0,
  );
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
    ...(error instanceof ApprovedJobProcessingTimeoutError
      ? {
          failureReasonCode: "linkedin.approved_job_processing_timeout",
          retryable: true,
        }
      : {}),
  };
}

function buildExternalHandoffFailure(
  result: EasyApplyRunResult,
  error: unknown,
  submitMode: SubmitMode,
): EasyApplyExternalApplicationHandoff {
  const formatted = formatErrorForJobProcessing(error);
  const externalApplyUrl = result.externalApplyUrl ?? result.url;
  return {
    sourceUrl: result.url,
    externalApplyUrl,
    canonicalUrl: externalApplyUrl,
    runType: submitMode,
    status: "failed",
    stopReason:
      `External application handoff failed in isolation: ` +
      `${formatted.summary || getErrorMessage(error)}`,
    failureReasonCode: "external.handoff_exception",
    retryable: true,
    error: formatted.serialized,
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

function buildUnknownApplicationStateBatchResult(url: string): EasyApplyBatchJobResult {
  return {
    url,
    evaluation: {
      shouldApply: false,
      finalDecision: "SKIP",
      score: 0,
      reason:
        "Could not safely confirm this LinkedIn job's application state, so it was skipped before parsing and scoring.",
      policyAllowed: false,
    },
  };
}

async function inspectJobApplicationState(
  driver: EasyApplyDriver,
  url: string,
): Promise<EasyApplyJobApplicationState | null> {
  if (!driver.inspectJobApplicationState) {
    return null;
  }

  try {
    return await driver.inspectJobApplicationState(url);
  } catch {
    return "unknown";
  }
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

function isExternalApplicationEvaluation(
  evaluation: EasyApplyJobEvaluation,
): boolean {
  return evaluation.diagnostics?.applicationType?.trim().toLowerCase() === "external";
}

export function isCompletedEasyApplyResult(
  result: EasyApplyRunResult | undefined,
): boolean {
  if (!result) {
    return false;
  }
  if (result.status === "submitted" || result.status === "ready_to_submit") {
    return true;
  }
  if (result.status !== "stopped_external_apply") {
    return false;
  }

  const handoff = result.externalApplication;
  if (!handoff || handoff.status !== "completed") {
    return false;
  }
  if (handoff.runType === "submit") {
    return handoff.finalStage === "completed";
  }
  return handoff.finalStage === "completed" || handoff.finalStage === "final_submit_step";
}

function buildUnverifiedExternalApplyResult(args: {
  url: string;
  stopReason: string;
  failureReasonCode: string;
  error?: unknown;
  recovery?: EasyApplyRunResult["recovery"];
}): EasyApplyRunResult {
  const formattedError = args.error === undefined
    ? null
    : formatErrorForJobProcessing(args.error);
  return {
    status: "stopped_unknown_action",
    steps: [],
    stopReason: formattedError
      ? `${args.stopReason} ${formattedError.summary}`
      : args.stopReason,
    url: args.url,
    failureReasonCode: args.failureReasonCode,
    retryable: true,
    ...(formattedError ? { error: formattedError.serialized } : {}),
    ...(args.recovery ? { recovery: args.recovery } : {}),
  };
}

async function processExternalApprovedBatchJob(
  input: EasyApplyBatchRunInput,
  url: string,
  prepareJobPage = false,
): Promise<EasyApplyRunResult> {
  const timeoutMs = readPositiveInteger(
    prepareJobPage
      ? input.jobProcessingTimeoutMs
      : input.externalApplyInspectionTimeoutMs,
    prepareJobPage
      ? DEFAULT_JOB_PROCESSING_TIMEOUT_MS
      : DEFAULT_EXTERNAL_APPLY_INSPECTION_TIMEOUT_MS,
  );
  const abortController = new AbortController();
  const guardedDriver = createAbortGuardedDriver(
    input.driver,
    abortController.signal,
  );

  try {
    return await withTimeout(
      (async () => {
        if (prepareJobPage) {
          await guardedDriver.driver.ensureAuthenticated(url);
        }
        const externalApplyAvailable =
          (await guardedDriver.driver.isExternalApplyAvailable?.()) === true;
        if (!externalApplyAvailable) {
          return buildUnverifiedExternalApplyResult({
            url,
            stopReason:
              "The evaluation classified this job as external, but no external application control could be verified on the inspected LinkedIn job page.",
            failureReasonCode: "linkedin.external_apply_control_unverified",
          });
        }

        const externalDetection =
          (await guardedDriver.driver.getExternalApplyDetection?.()) ?? null;
        const rawExternalApplyUrl =
          (await guardedDriver.driver.getExternalApplyUrl?.()) ?? null;
        const externalApplyUrl = resolveLinkedInExternalApplyUrl(rawExternalApplyUrl);
        if (!externalDetection || externalDetection.signals.length === 0) {
          return buildUnverifiedExternalApplyResult({
            url,
            stopReason:
              "The external application control was visible, but its detection evidence could not be verified safely.",
            failureReasonCode: "linkedin.external_apply_signal_unverified",
          });
        }
        if (!externalApplyUrl) {
          return buildUnverifiedExternalApplyResult({
            url,
            stopReason:
              "The external application control was verified, but its destination URL was missing or unsafe.",
            failureReasonCode: "linkedin.external_apply_target_unverified",
          });
        }

        return {
          status: "stopped_external_apply" as const,
          steps: [],
          stopReason: "This LinkedIn job redirects to an external application page.",
          url,
          externalApplyUrl,
          externalDetection,
        };
      })(),
      timeoutMs,
      () => {
        const timeoutError = new ExternalApplyInspectionTimeoutError(
          url,
          timeoutMs,
          guardedDriver.waitForInFlightCalls,
        );
        abortController.abort(timeoutError);
        return timeoutError;
      },
    );
  } catch (error) {
    if (error instanceof ExternalApplyInspectionTimeoutError) {
      throw error;
    }
    return buildUnverifiedExternalApplyResult({
      url,
      stopReason:
        "Could not safely finish external application inspection on the current LinkedIn job page.",
      failureReasonCode: "linkedin.external_apply_inspection_failed",
      error,
    });
  }
}

async function processApprovedBatchJob(
  input: EasyApplyBatchRunInput,
  url: string,
  evaluation: EasyApplyJobEvaluation,
  submitMode: SubmitMode,
  isolatedProcessingDriver = false,
): Promise<EasyApplyRunResult> {
  if (isExternalApplicationEvaluation(evaluation)) {
    return processExternalApprovedBatchJob(input, url, isolatedProcessingDriver);
  }

  const timeoutMs = readPositiveInteger(
    input.jobProcessingTimeoutMs,
    DEFAULT_JOB_PROCESSING_TIMEOUT_MS,
  );
  const abortController = new AbortController();
  const guardedDriver = createAbortGuardedDriver(
    input.driver,
    abortController.signal,
  );
  return withTimeout(
    runEasyApplyInternal(
      {
        driver: guardedDriver.driver,
        url,
        candidateProfile: input.candidateProfile,
        resolveAnswer: input.resolveAnswer,
        ...(input.maxSteps ? { maxSteps: input.maxSteps } : {}),
      },
      submitMode,
    ),
    timeoutMs,
    () => {
      const timeoutError = new ApprovedJobProcessingTimeoutError(
        url,
        timeoutMs,
        guardedDriver.waitForInFlightCalls,
      );
      // Recovery uses the original driver to navigate back to the collection.
      // The aborted proxy prevents the timed-out coroutine from issuing any
      // later driver calls if an LLM/browser promise settles after recovery.
      abortController.abort(timeoutError);
      return timeoutError;
    },
  );
}

function buildCollectionJobUrl(collectionUrl: string, jobUrl: string): string {
  try {
    const collection = new URL(collectionUrl);
    const job = new URL(jobUrl);
    const jobId = job.pathname.match(/\/jobs\/view\/(\d+)/)?.[1];
    if (!jobId) {
      return collection.toString();
    }

    collection.searchParams.set("currentJobId", jobId);
    return collection.toString();
  } catch {
    return collectionUrl;
  }
}

function buildCurrentCollectionJobUrl(
  input: EasyApplyBatchRunInput,
  jobUrl: string,
): string {
  const currentCollectionUrl =
    input.driver.getCurrentCollectionUrl?.() ?? input.url;
  return buildCollectionJobUrl(currentCollectionUrl, jobUrl);
}

function getCurrentCollectionPageUrl(input: EasyApplyBatchRunInput): string {
  const currentCollectionUrl =
    input.driver.getCurrentCollectionUrl?.() ?? input.url;
  try {
    const collection = new URL(currentCollectionUrl);
    collection.searchParams.delete("currentJobId");
    return collection.toString();
  } catch {
    return input.url;
  }
}

async function restoreCollectionContextAfterApprovedJob(
  input: EasyApplyBatchRunInput,
  jobUrl: string,
): Promise<void> {
  await runBoundedCollectionContextOperation(
    input,
    jobUrl,
    "restore",
    (driver) => driver.openCollection(buildCurrentCollectionJobUrl(input, jobUrl)),
  );
}

async function recoverCollectionAfterIsolatedJobFailure(
  input: EasyApplyBatchRunInput,
  failedJobUrl: string,
): Promise<NonNullable<EasyApplyRunResult["recovery"]>> {
  try {
    await runBoundedCollectionContextOperation(
      input,
      failedJobUrl,
      "recovery",
      (driver) => driver.openCollection(
        buildCurrentCollectionJobUrl(input, failedJobUrl),
      ),
    );
    return {
      attempted: true,
      succeeded: true,
      message:
        `Recovered batch context after isolated processing failed on ${failedJobUrl}. ` +
        "The collection page remained separate from the failed application attempt.",
    };
  } catch (recoveryError) {
    return {
      attempted: true,
      succeeded: false,
      message:
        `Failed to recover the collection after isolated processing failed on ${failedJobUrl}: ` +
        getErrorMessage(recoveryError),
    };
  }
}

async function recoverBatchAfterJobFailure(
  input: EasyApplyBatchRunInput,
  failedJobUrl: string,
): Promise<NonNullable<EasyApplyRunResult["recovery"]>> {
  try {
    await runBoundedCollectionContextOperation(
      input,
      failedJobUrl,
      "recovery",
      async (driver) => {
        const recoveryUrl = getCurrentCollectionPageUrl(input);
        await driver.ensureAuthenticated(recoveryUrl);
        await driver.openCollection(recoveryUrl);
      },
    );
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
  if ((await driver.isAlreadyApplied?.()) === true) {
    return {
      status: "stopped_not_easy_apply",
      steps: [],
      stopReason: "This LinkedIn job has already been applied to.",
      url,
      alreadyApplied: true,
    };
  }

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
  const action = !stateSnapshot || isEmptyUnknownStepState(stateSnapshot)
    ? await args.input.driver.getPrimaryAction()
    : stateSnapshot.primaryAction;
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
  const applicationState = await inspectJobApplicationState(input.driver, input.url);
  if (applicationState === "already_applied") {
    return {
      status: "stopped_not_easy_apply",
      steps: [],
      stopReason: "This LinkedIn job has already been applied to.",
      url: input.url,
      alreadyApplied: true,
    };
  }
  if (applicationState === "unknown") {
    return {
      status: "stopped_not_easy_apply",
      steps: [],
      stopReason:
        "Could not safely confirm the LinkedIn application state. No application flow was opened.",
      url: input.url,
    };
  }
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

    const unknownActionDiagnostics =
      await input.driver.collectUnknownActionDiagnostics?.();
    return {
      status: "stopped_unknown_action",
      steps,
      stopReason: "Could not determine the next Easy Apply action.",
      url: input.url,
      failureReasonCode: "linkedin.empty_or_unrecognized_action_state",
      retryable: true,
      ...(unknownActionDiagnostics ? { unknownActionDiagnostics } : {}),
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
  const maxPages = readPositiveInteger(input.maxPages, DEFAULT_BATCH_MAX_PAGES);
  const maxConsecutiveNoProgressPages = readPositiveInteger(
    input.maxConsecutiveNoProgressPages,
    DEFAULT_BATCH_MAX_CONSECUTIVE_NO_PROGRESS_PAGES,
  );
  const seenUrls = new Set<string>();
  const jobs: EasyApplyBatchJobResult[] = [];
  let pagesVisited = 0;
  let skippedCount = 0;
  let attemptedCount = 0;
  let successfulCount = 0;
  let recoveryFailureCount = 0;
  let consecutiveNoProgressPages = 0;
  let boundedStopReason: string | null = null;
  let paginationStopReason: EasyApplyPaginationStopReason | null = null;

  await input.driver.ensureAuthenticated(input.url);
  await input.driver.openCollection(input.url);
  pagesVisited += 1;
  await input.observeBatchEvent?.({
    type: "collection_opened",
    collectionUrl: input.url,
    pageNumber: pagesVisited,
  });

  while (successfulCount < requestedCount) {
    const seenCountBeforePage = seenUrls.size;
    const visibleJobs = await collectVisibleBatchJobs(input.driver);

    for (const job of visibleJobs) {
      const { url, alreadyApplied: cardAlreadyApplied } = job;
      if (seenUrls.has(url)) {
        continue;
      }

      seenUrls.add(url);
      const preEvaluationState = cardAlreadyApplied
        ? "already_applied"
        : await inspectJobApplicationState(input.driver, url);
      const alreadyApplied = preEvaluationState === "already_applied";
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

      if (preEvaluationState === "unknown") {
        skippedCount += 1;
        const unknownStateJob = buildUnknownApplicationStateBatchResult(url);
        jobs.push(unknownStateJob);
        await input.observeBatchEvent?.({
          type: "job_evaluated",
          collectionUrl: input.url,
          jobUrl: url,
          pageNumber: pagesVisited,
          evaluation: unknownStateJob.evaluation,
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

      if (evaluation.shouldApply) {
        const preApplyState = await inspectJobApplicationState(input.driver, url);
        if (preApplyState === "already_applied") {
          evaluation = buildAlreadyAppliedBatchResult(url).evaluation;
        } else if (preApplyState === "unknown") {
          evaluation = buildUnknownApplicationStateBatchResult(url).evaluation;
        }
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
      let recoveredAfterProcessingFailure = false;
      let processingLease: EasyApplyProcessingDriverLease | null = null;
      let processingLeaseDisposed = false;
      const disposeProcessingLease = async (): Promise<void> => {
        if (!processingLease || processingLeaseDisposed) {
          return;
        }
        await processingLease.dispose();
        processingLeaseDisposed = true;
      };

      try {
        await input.observeBatchEvent?.({
          type: "job_processing_started",
          collectionUrl: input.url,
          jobUrl: url,
          pageNumber: pagesVisited,
          attemptIndex: attemptedCount + 1,
          evaluation,
        });
        processingLease =
          (await input.driver.createProcessingDriver?.(url)) ?? null;
        const processingInput = processingLease
          ? { ...input, driver: processingLease.driver }
          : input;
        entry.result = await processApprovedBatchJob(
          processingInput,
          url,
          evaluation,
          submitMode,
          processingLease != null,
        );
        if (
          entry.result.status === "stopped_external_apply" &&
          input.continueExternalApplication
        ) {
          let externalApplication: EasyApplyExternalApplicationHandoff | null;
          try {
            externalApplication = await input.continueExternalApplication(
              entry.result,
            );
          } catch (error) {
            // External sites run outside the LinkedIn collection lifecycle. A
            // handoff exception belongs to this job and must never trigger
            // collection recovery or terminate the remaining batch.
            externalApplication = buildExternalHandoffFailure(
              entry.result,
              error,
              submitMode,
            );
          }
          if (externalApplication) {
            entry.result = {
              ...entry.result,
              externalApplication,
            };
          }
        }
        await disposeProcessingLease();
      } catch (error) {
        await disposeProcessingLease().catch(() => undefined);
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
        let recovery: NonNullable<EasyApplyRunResult["recovery"]> | null = null;
        if (
          (error instanceof ApprovedJobProcessingTimeoutError ||
            error instanceof ExternalApplyInspectionTimeoutError) &&
          !processingLease &&
          input.driver.resetAfterProcessingTimeout
        ) {
          try {
            await runBoundedCollectionContextOperation(
              input,
              url,
              "reset",
              (driver, signal) => driver.resetAfterProcessingTimeout?.({
                waitForTimedOutOperations: error.waitForTimedOutOperations,
                signal,
              }) ?? Promise.resolve(),
            );
          } catch (resetError) {
            recovery = {
              attempted: false,
              succeeded: false,
              message:
                `Failed to reset the timed-out LinkedIn page for ${url}: ` +
                `${getErrorMessage(resetError)} Recovery was not attempted because ` +
                "the driver context could not be safely reused.",
            };
          }
        }
        recovery ??= processingLease
          ? await recoverCollectionAfterIsolatedJobFailure(input, url)
          : await recoverBatchAfterJobFailure(input, url);
        await input.observeBatchEvent?.({
          type: "job_processing_recovered",
          collectionUrl: input.url,
          jobUrl: url,
          pageNumber: pagesVisited,
          attemptIndex: attemptedCount + 1,
          recovered: recovery.succeeded,
          message: recovery.message,
        });
        entry.result = error instanceof ExternalApplyInspectionTimeoutError
          ? buildUnverifiedExternalApplyResult({
              url,
              stopReason:
                "External application inspection timed out before the current LinkedIn job page could be verified safely.",
              failureReasonCode: "linkedin.external_apply_inspection_timeout",
              error,
              recovery,
            })
          : buildJobProcessingFailure(url, error, recovery);
        recoveredAfterProcessingFailure = recovery.succeeded;
        if (!recovery.succeeded) {
          if (recovery.attempted) {
            recoveryFailureCount += 1;
          }
          boundedStopReason =
            `${recovery.message} Stopped the LinkedIn batch because the driver context could not be safely reused.`;
        }
      } finally {
        await disposeProcessingLease().catch(() => undefined);
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
      if (isCompletedEasyApplyResult(entry.result)) {
        successfulCount += 1;
      }

      if (boundedStopReason) {
        break;
      }

      // A successful failure-recovery already reopened the base collection.
      // Restoring currentJobId again is redundant and can start a second,
      // unbounded navigation on the same page after a processing timeout.
      if (!recoveredAfterProcessingFailure) {
        try {
          await restoreCollectionContextAfterApprovedJob(input, url);
        } catch (restoreError) {
          const restoreMessage = getErrorMessage(restoreError);
          if (restoreError instanceof CollectionContextOperationTimeoutError) {
            boundedStopReason =
              `Stopped the LinkedIn batch because ${restoreMessage} ` +
              "The driver context could not be safely reused.";
            break;
          }

          const recovery = await recoverBatchAfterJobFailure(input, url);
          await input.observeBatchEvent?.({
            type: "job_processing_recovered",
            collectionUrl: input.url,
            jobUrl: url,
            pageNumber: pagesVisited,
            attemptIndex: attemptedCount,
            recovered: recovery.succeeded,
            message:
              `Collection restore failed (${restoreMessage}). ${recovery.message}`,
          });
          if (!recovery.succeeded) {
            recoveryFailureCount += 1;
            boundedStopReason =
              `Collection restore failed for ${url}: ${restoreMessage}. ${recovery.message} ` +
              "Stopped the LinkedIn batch because the driver context could not be safely reused.";
            break;
          }
        }
      }

      if (successfulCount >= requestedCount) {
        break;
      }
    }

    if (boundedStopReason || successfulCount >= requestedCount) {
      break;
    }

    const discoveredNewJobs = seenUrls.size > seenCountBeforePage;
    consecutiveNoProgressPages = discoveredNewJobs
      ? 0
      : consecutiveNoProgressPages + 1;

    if (pagesVisited >= maxPages) {
      boundedStopReason =
        `Stopped LinkedIn pagination after the configured maximum of ${maxPages} page(s).`;
      break;
    }

    if (consecutiveNoProgressPages >= maxConsecutiveNoProgressPages) {
      boundedStopReason =
        `Stopped LinkedIn pagination after ${consecutiveNoProgressPages} consecutive page(s) produced no new unique jobs.`;
      break;
    }

    const advanced = await input.driver.goToNextResultsPage();
    if (!advanced) {
      paginationStopReason = input.driver.getLastPaginationStopReason?.() ?? {
        code: "driver_could_not_advance",
        message: "The LinkedIn results driver could not advance to another page.",
      };
      boundedStopReason =
        `Stopped LinkedIn pagination on page ${pagesVisited}: ${paginationStopReason.message}`;
      await input.observeBatchEvent?.({
        type: "pagination_stopped",
        collectionUrl: input.url,
        pageNumber: pagesVisited,
        reason: paginationStopReason,
      });
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
      successfulCount: 0,
      evaluatedCount: 0,
      skippedCount: 0,
      pagesVisited,
      jobs: [],
      stopReason: [
        "No LinkedIn Easy Apply jobs were discovered from the collection page.",
        boundedStopReason,
      ].filter(Boolean).join(" "),
      ...(paginationStopReason ? { paginationStopReason } : {}),
    };
  }

  const approvedJobs = jobs.filter((job) => job.evaluation.shouldApply);
  const incompleteApprovedJobs = approvedJobs.filter(
    (job) => !isCompletedEasyApplyResult(job.result),
  );
  const status =
    successfulCount >= requestedCount &&
    boundedStopReason === null
      ? "completed"
      : "partial";
  const incompleteStopReason = incompleteApprovedJobs.length > 0
    ? `Completed ${successfulCount} of ${requestedCount} requested LinkedIn application(s) after ${attemptedCount} approved attempt(s); ${incompleteApprovedJobs.length} attempt(s) stopped before completion${recoveryFailureCount > 0 ? ` and ${recoveryFailureCount} recovery attempt(s) failed` : ""}.`
    : null;
  const stopReason =
    status === "completed"
      ? `Completed ${successfulCount} requested LinkedIn application(s) after ${attemptedCount} approved attempt(s).`
      : [incompleteStopReason, boundedStopReason].filter(Boolean).join(" ") ||
        `Completed ${successfulCount} of ${requestedCount} requested LinkedIn application(s) after ${attemptedCount} approved attempt(s) before pagination ended.`;

  return {
    status,
    collectionUrl: input.url,
    requestedCount,
    attemptedCount,
    successfulCount,
    evaluatedCount: jobs.length,
    skippedCount,
    pagesVisited,
    jobs,
    stopReason,
    ...(paginationStopReason ? { paginationStopReason } : {}),
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
