import type { CandidateProfile } from "../candidate/types.js";
import type { InputQuestion } from "../questions/types.js";
import type { ResolvedAnswer } from "../answers/types.js";
import { getErrorMessage } from "../utils/errors.js";

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
}

export interface EasyApplyStepReport {
  stepIndex: number;
  questions: EasyApplyAnsweredQuestion[];
  action: EasyApplyPrimaryAction;
  stateSnapshot?: EasyApplyStepStateSnapshot;
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
  reviewDiagnostics?: EasyApplyReviewDiagnostics;
  alreadyApplied?: boolean;
}

export interface EasyApplyJobEvaluation {
  shouldApply: boolean;
  finalDecision: "APPLY" | "MAYBE" | "SKIP";
  score: number;
  reason: string;
  policyAllowed: boolean;
  alreadyApplied?: boolean;
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
  isAlreadyApplied?(): Promise<boolean>;
  openEasyApply(): Promise<void>;
  collectQuestions(): Promise<EasyApplyQuestionView[]>;
  collectVisibleJobs?(): Promise<EasyApplyCollectionJob[]>;
  collectVisibleJobUrls?(): Promise<string[]>;
  goToNextResultsPage(): Promise<boolean>;
  collectStepState?(): Promise<EasyApplyStepStateSnapshot>;
  collectReviewDiagnostics?(): Promise<EasyApplyReviewDiagnostics>;
  fillAnswer(
    question: EasyApplyQuestionView,
    resolved: ResolvedAnswer,
  ): Promise<{ filled: boolean; details?: string }>;
  getPrimaryAction(): Promise<EasyApplyPrimaryAction>;
  advance(action: "next" | "review" | "submit"): Promise<void>;
  dismissCompletionModal?(): Promise<boolean>;
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
}

type SubmitMode = "dry-run" | "submit";

function buildJobProcessingFailure(url: string, error: unknown): EasyApplyRunResult {
  return {
    status: "stopped_unknown_action",
    steps: [],
    stopReason: `Job processing failed: ${getErrorMessage(error)}`,
    url,
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
  const externalApplyUrl = externalApplyAvailable
    ? ((await driver.getExternalApplyUrl?.()) ?? undefined)
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

  const filled = isManualReviewAnswer(resolved)
    ? {
        filled: false,
        details: "Skipped because it is marked for manual review.",
      }
    : await input.driver.fillAnswer(question, resolved);

  return {
    answeredQuestion: {
      question,
      resolved,
      filled: filled.filled,
      ...(filled.details ? { details: filled.details } : {}),
    },
    hasRequiredManualReview: question.required && !filled.filled,
  };
}

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
    },
    hasRequiredManualReview,
    stepSignature,
  };
}

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

  for (let stepIndex = 0; stepIndex < maxSteps; stepIndex += 1) {
    const step = await executeStep({ input, stepIndex });
    steps.push(step.report);

    if (step.report.action === "submit") {
      if (submitMode === "dry-run") {
        return {
          status: "ready_to_submit",
          steps,
          stopReason:
            "Reached the final submit step. Dry run stops before submission.",
          url: input.url,
        };
      }

      if (step.hasRequiredManualReview) {
        return {
          status: "stopped_manual_review",
          steps,
          stopReason:
            "A required Easy Apply question needs manual review before submitting.",
          url: input.url,
        };
      }

      await input.driver.advance("submit");
      await input.driver.dismissCompletionModal?.();

      return {
        status: "submitted",
        steps,
        stopReason: "Application submitted successfully.",
        url: input.url,
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
    };
  }

  return {
    status: "stopped_unknown_action",
    steps,
    stopReason: `Exceeded the Easy Apply step limit of ${maxSteps}.`,
    url: input.url,
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

      const evaluation = await input.evaluateJob(url);
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
        entry.result = buildJobProcessingFailure(url, error);
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
      if (attemptedCount >= requestedCount) {
        break;
      }
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
  const stopReason =
    status === "completed"
      ? `Processed ${attemptedCount} LinkedIn Easy Apply job(s).`
      : `Only found and processed ${attemptedCount} matching LinkedIn Easy Apply job(s) before pagination ended.`;

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
