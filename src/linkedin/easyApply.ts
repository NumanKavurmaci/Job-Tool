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
}

export interface EasyApplyJobEvaluation {
  shouldApply: boolean;
  finalDecision: "APPLY" | "MAYBE" | "SKIP";
  score: number;
  reason: string;
  policyAllowed: boolean;
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
}

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
  const stepSignature = JSON.stringify(
    questions.map((question) => ({
      key: question.fieldKey,
      label: question.label,
      required: question.required,
    })),
  );
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

  const action = await args.input.driver.getPrimaryAction();

  return {
    report: {
      stepIndex: args.stepIndex,
      questions: answeredQuestions,
      action,
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
        return {
          status: step.hasRequiredManualReview
            ? "stopped_manual_review"
            : "stopped_unknown_action",
          steps,
          stopReason: step.hasRequiredManualReview
            ? "Review step did not advance because required questions still need review or valid input."
            : "Review step repeated without advancing.",
          url: input.url,
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
  const approvedUrls: string[] = [];
  let pagesVisited = 0;
  let skippedCount = 0;

  await input.driver.ensureAuthenticated(input.url);
  await input.driver.openCollection(input.url);
  pagesVisited += 1;

  while (approvedUrls.length < requestedCount) {
    const visibleJobs = input.driver.collectVisibleJobs
      ? await input.driver.collectVisibleJobs()
      : ((await input.driver.collectVisibleJobUrls?.()) ?? []).map((url) => ({
          url,
          alreadyApplied: false,
        }));

    for (const job of visibleJobs) {
      const { url, alreadyApplied } = job;
      if (seenUrls.has(url)) {
        continue;
      }

      seenUrls.add(url);

      if (alreadyApplied) {
        skippedCount += 1;
        jobs.push({
          url,
          evaluation: {
            shouldApply: false,
            finalDecision: "SKIP",
            score: 0,
            reason: "Job already has a LinkedIn applied badge.",
            policyAllowed: true,
          },
        });
        continue;
      }

      const evaluation = await input.evaluateJob(url);

      if (!evaluation.shouldApply) {
        skippedCount += 1;
        jobs.push({ url, evaluation });
        continue;
      }

      approvedUrls.push(url);
      jobs.push({ url, evaluation });
      if (approvedUrls.length >= requestedCount) {
        break;
      }
    }

    if (approvedUrls.length >= requestedCount) {
      break;
    }

    const advanced = await input.driver.goToNextResultsPage();
    if (!advanced) {
      break;
    }

    pagesVisited += 1;
  }

  if (jobs.length === 0 && approvedUrls.length === 0) {
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

  let attemptedCount = 0;
  for (const url of approvedUrls) {
    let result: EasyApplyRunResult;
    try {
      result = await runEasyApplyInternal(
        {
          driver: input.driver,
          url,
          candidateProfile: input.candidateProfile,
          resolveAnswer: input.resolveAnswer,
          ...(input.maxSteps ? { maxSteps: input.maxSteps } : {}),
        },
        submitMode,
      );
    } catch (error) {
      result = {
        status: "stopped_unknown_action",
        steps: [],
        stopReason: `Job processing failed: ${getErrorMessage(error)}`,
        url,
      };
    }

    const entry = jobs.find((job) => job.url === url);
    if (entry) {
      entry.result = result;
    }
    attemptedCount += 1;
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
