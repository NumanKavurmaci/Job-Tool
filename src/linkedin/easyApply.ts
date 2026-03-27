import type { CandidateProfile } from "../candidate/types.js";
import type { InputQuestion } from "../questions/types.js";
import type { ResolvedAnswer } from "../answers/types.js";

export type EasyApplyPrimaryAction = "next" | "review" | "submit" | "unknown";

export interface EasyApplyQuestionView extends InputQuestion {
  fieldKey: string;
  required: boolean;
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
    | "ready_to_submit"
    | "stopped_manual_review"
    | "stopped_not_easy_apply"
    | "stopped_unknown_action";
  steps: EasyApplyStepReport[];
  stopReason: string;
  url: string;
}

export interface EasyApplyDriver {
  open(url: string): Promise<void>;
  ensureAuthenticated(url: string): Promise<void>;
  isEasyApplyAvailable(): Promise<boolean>;
  openEasyApply(): Promise<void>;
  collectQuestions(): Promise<EasyApplyQuestionView[]>;
  fillAnswer(question: EasyApplyQuestionView, resolved: ResolvedAnswer): Promise<{ filled: boolean; details?: string }>;
  getPrimaryAction(): Promise<EasyApplyPrimaryAction>;
  advance(action: "next" | "review"): Promise<void>;
}

export function isManualReviewAnswer(answer: ResolvedAnswer): boolean {
  return answer.strategy === "needs-review" || answer.confidenceLabel === "manual_review";
}

export function isSubmitButtonLabel(label: string): boolean {
  return label.trim().toLowerCase() === "submit application";
}

export function chooseRadioValue(options: string[], answer: ResolvedAnswer["answer"]): string | null {
  const normalizedOptions = options.map((option) => option.trim());
  if (typeof answer === "boolean") {
    const wanted = answer ? ["yes", "true"] : ["no", "false"];
    return normalizedOptions.find((option) => wanted.includes(option.toLowerCase())) ?? null;
  }

  if (typeof answer === "string") {
    const exact = normalizedOptions.find(
      (option) => option.toLowerCase() === answer.trim().toLowerCase(),
    );
    if (exact) {
      return exact;
    }

    return normalizedOptions.find((option) =>
      option.toLowerCase().includes(answer.trim().toLowerCase()),
    ) ?? null;
  }

  return null;
}

export async function runEasyApplyDryRun(input: {
  driver: EasyApplyDriver;
  url: string;
  candidateProfile: CandidateProfile;
  resolveAnswer: (args: {
    question: InputQuestion;
    candidateProfile: CandidateProfile;
  }) => Promise<ResolvedAnswer>;
  maxSteps?: number;
}): Promise<EasyApplyRunResult> {
  const maxSteps = input.maxSteps ?? 10;

  await input.driver.ensureAuthenticated(input.url);
  await input.driver.open(input.url);

  if (!(await input.driver.isEasyApplyAvailable())) {
    return {
      status: "stopped_not_easy_apply",
      steps: [],
      stopReason: "Easy Apply button was not found on the page.",
      url: input.url,
    };
  }

  await input.driver.openEasyApply();

  const steps: EasyApplyStepReport[] = [];

  for (let stepIndex = 0; stepIndex < maxSteps; stepIndex += 1) {
    const questions = await input.driver.collectQuestions();
    const answeredQuestions: EasyApplyAnsweredQuestion[] = [];
    let hasRequiredManualReview = false;

    for (const question of questions) {
      const resolved = await input.resolveAnswer({
        question,
        candidateProfile: input.candidateProfile,
      });

      if (question.required && isManualReviewAnswer(resolved)) {
        hasRequiredManualReview = true;
        answeredQuestions.push({
          question,
          resolved,
          filled: false,
          details: "Required question needs manual review.",
        });
        continue;
      }

      const filled = isManualReviewAnswer(resolved)
        ? { filled: false, details: "Skipped because it is marked for manual review." }
        : await input.driver.fillAnswer(question, resolved);

      answeredQuestions.push({
        question,
        resolved,
        filled: filled.filled,
        ...(filled.details ? { details: filled.details } : {}),
      });
    }

    const action = await input.driver.getPrimaryAction();
    steps.push({
      stepIndex,
      questions: answeredQuestions,
      action,
    });

    if (action === "submit") {
      return {
        status: "ready_to_submit",
        steps,
        stopReason: "Reached the final submit step. Dry run stops before submission.",
        url: input.url,
      };
    }

    if (action === "review") {
      await input.driver.advance(action);
      continue;
    }

    if (hasRequiredManualReview) {
      return {
        status: "stopped_manual_review",
        steps,
        stopReason: "A required Easy Apply question needs manual review.",
        url: input.url,
      };
    }

    if (action === "next") {
      await input.driver.advance(action);
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
