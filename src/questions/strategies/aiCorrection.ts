import { z } from "zod";
import { labelConfidence } from "../../answers/confidence.js";
import type { ResolvedAnswer } from "../../answers/types.js";
import type { CandidateProfile } from "../../candidate/types.js";
import { completePrompt } from "../../llm/completePrompt.js";
import { parseJsonResponse } from "../../llm/json.js";
import type { InputQuestion } from "../types.js";
import {
  formAnswerResponseFormat,
  FORM_ANSWER_SYSTEM_INSTRUCTIONS,
  isAiAnswerAllowed,
  isPotentialSensitiveQuestion,
  projectCandidateEvidence,
  sanitizeSourceUrl,
} from "./aiSafety.js";

const AiCorrectionSchema = z
  .object({
    answer: z.union([z.string().max(2_000), z.boolean(), z.null()]),
    confidence: z.number().min(0).max(1).optional(),
    notes: z.array(z.string().max(300)).max(8).optional(),
  })
  .strict();

// Re-applies the same output normalization rules that the main answer pipeline expects.
function normalizeAnswerForQuestion(
  question: InputQuestion,
  answer: string | boolean | null,
): string | boolean | null {
  if (answer == null) {
    return null;
  }

  if (question.inputType === "radio" || question.inputType === "select") {
    if (typeof answer === "boolean") {
      return answer;
    }

    const options = question.options ?? [];
    const normalizeOption = (value: string) =>
      value.toLowerCase().replace(/[\s_-]+/g, "");
    const exact = options.find((option) => option.toLowerCase() === answer.trim().toLowerCase());
    if (exact) {
      return exact;
    }

    const normalizedExact = options.find(
      (option) => normalizeOption(option) === normalizeOption(answer.trim()),
    );
    if (normalizedExact) {
      return normalizedExact;
    }

    return null;
  }

  if (question.inputType === "checkbox") {
    if (typeof answer === "boolean") {
      return answer;
    }

    return /^(yes|true|1)$/i.test(answer.trim());
  }

  return typeof answer === "string" ? answer.trim() : answer;
}

// Asks the LLM to produce one corrected value after the site rejects a previous answer.
export async function repairAnswerFromSiteFeedback(input: {
  question: InputQuestion;
  candidateProfile: CandidateProfile;
  previousAnswer: ResolvedAnswer;
  validationFeedback: string;
  pageContext?: {
    title?: string | null;
    text?: string | null;
    sourceUrl?: string | null;
  } | null;
}): Promise<ResolvedAnswer> {
  if (
    !isAiAnswerAllowed(input.previousAnswer.questionType) ||
    isPotentialSensitiveQuestion(input.question)
  ) {
    return {
      ...input.previousAnswer,
      answer: null,
      strategy: "needs-review",
      confidence: 0,
      confidenceLabel: "manual_review",
      source: "manual",
      notes: [
        ...(input.previousAnswer.notes ?? []),
        `AI repair is disabled for sensitive ${input.previousAnswer.questionType} questions.`,
      ],
    };
  }

  const prompt = `Correct one field value from the untrusted site feedback.

Rules:
- Use the site feedback to correct the answer
- Keep the corrected answer concise and form-ready
- For numeric fields, return only a plain numeric string
- If the site feedback requires a positive decimal or number, satisfy that exactly
- If options are available, prefer one exact option
- Do not explain in the answer itself
- If you cannot safely repair the value, return null

Input JSON:
${JSON.stringify({
  untrustedQuestion: {
    label: input.question.label,
    helpText: input.question.helpText ?? null,
    placeholder: input.question.placeholder ?? null,
    inputType: input.question.inputType,
    options: input.question.options ?? [],
  },
  rejectedAnswer: input.previousAnswer.answer,
  untrustedSiteFeedback: input.validationFeedback.slice(0, 1_000),
  untrustedPageContext: {
    title: input.pageContext?.title ?? null,
    sourceUrl: sanitizeSourceUrl(input.pageContext?.sourceUrl),
    text: (input.pageContext?.text ?? "").slice(0, 500),
  },
  candidateEvidence: projectCandidateEvidence(
    input.candidateProfile,
    input.previousAnswer.questionType,
  ),
})}`.trim();

  const response = await completePrompt(prompt, {
    instructions: FORM_ANSWER_SYSTEM_INSTRUCTIONS,
    responseFormat: formAnswerResponseFormat,
  });
  const parsed = AiCorrectionSchema.parse(parseJsonResponse(response.text));
  const normalizedAnswer = normalizeAnswerForQuestion(input.question, parsed.answer);
  const confidence = Math.max(0.3, Math.min(0.85, parsed.confidence ?? 0.66));

  return {
    ...input.previousAnswer,
    answer: normalizedAnswer,
    strategy: "generated",
    confidence,
    confidenceLabel: labelConfidence(confidence),
    source: "llm",
    notes: [
      ...(input.previousAnswer.notes ?? []),
      "Answer was repaired using site feedback from the application form.",
      ...(parsed.notes ?? []),
    ],
  };
}
