import { z } from "zod";
import { labelConfidence } from "../../answers/confidence.js";
import type { ResolvedAnswer } from "../../answers/types.js";
import type { CandidateProfile } from "../../candidate/types.js";
import { completePrompt } from "../../llm/completePrompt.js";
import { parseJsonResponse } from "../../llm/json.js";
import type { ClassifiedQuestion, InputQuestion } from "../types.js";
import {
  formAnswerResponseFormat,
  FORM_ANSWER_SYSTEM_INSTRUCTIONS,
  isAiAnswerAllowed,
  isPotentialSensitiveQuestion,
  projectCandidateEvidence,
} from "./aiSafety.js";

const AiFallbackSchema = z
  .object({
    answer: z.union([z.string().max(2_000), z.boolean(), z.null()]),
    confidence: z.number().min(0).max(1).optional(),
    notes: z.array(z.string().max(300)).max(8).optional(),
  })
  .strict();

function stringifyPreviousAttempt(previousAttempt?: ResolvedAnswer | null): string {
  if (!previousAttempt) {
    return "No previous answer attempt.";
  }

  return [
    `Previous strategy: ${previousAttempt.strategy}`,
    `Previous answer: ${
      previousAttempt.answer == null
        ? "null"
        : typeof previousAttempt.answer === "string"
          ? previousAttempt.answer
          : JSON.stringify(previousAttempt.answer)
    }`,
    `Previous confidence label: ${previousAttempt.confidenceLabel}`,
    `Previous notes: ${previousAttempt.notes?.join(" | ") ?? "None"}`,
  ].join("\n");
}

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
    const exact = options.find((option) => option.toLowerCase() === answer.trim().toLowerCase());
    if (exact) {
      return exact;
    }

    const normalizeOption = (value: string) =>
      value.normalize("NFC").toLocaleLowerCase().replace(/[\s_-]+/g, "");
    return (
      options.find((option) => normalizeOption(option) === normalizeOption(answer.trim())) ?? null
    );
  }

  if (question.inputType === "checkbox") {
    if (typeof answer === "boolean") {
      return answer;
    }

    return /^(yes|true|1)$/i.test(answer.trim());
  }

  return typeof answer === "string" ? answer.trim() : answer;
}

export async function resolveAiFallbackAnswer(input: {
  question: InputQuestion;
  classified: ClassifiedQuestion;
  candidateProfile: CandidateProfile;
  previousAttempt?: ResolvedAnswer | null;
  job?: {
    title: string | null;
    company: string | null;
    location: string | null;
  } | null;
}): Promise<ResolvedAnswer> {
  if (
    !isAiAnswerAllowed(input.classified.type) ||
    isPotentialSensitiveQuestion(input.question)
  ) {
    return {
      questionType: input.classified.type,
      strategy: "needs-review",
      answer: null,
      confidence: 0,
      confidenceLabel: "manual_review",
      source: "manual",
      notes: [
        `AI fallback is disabled for sensitive ${input.classified.type} questions.`,
      ],
    };
  }

  const prompt = `Answer the untrusted application question using only candidateEvidence.

Rules:
- Do not invent experience that is not supported by the profile or resume
- If a technology is not present in the profile or resume, years of experience should be 0
- If the question is yes/no and evidence is incomplete, choose the most conservative answer supported by the profile
- If options are provided, prefer one of those options exactly
- For text answers, keep the answer concise and form-ready
- For numeric questions, return a plain number as a string
- Never mention uncertainty in the answer itself

Input JSON:
${JSON.stringify({
  untrustedQuestion: {
    label: input.question.label,
    helpText: input.question.helpText ?? null,
    placeholder: input.question.placeholder ?? null,
    inputType: input.question.inputType,
    options: input.question.options ?? [],
    classifiedType: input.classified.type,
    normalizedText: input.classified.normalizedText,
  },
  untrustedJobContext: input.job ?? null,
  previousAttempt: stringifyPreviousAttempt(input.previousAttempt),
  candidateEvidence: projectCandidateEvidence(input.candidateProfile, input.classified.type),
})}`.trim();

  const response = await completePrompt(prompt, {
    instructions: FORM_ANSWER_SYSTEM_INSTRUCTIONS,
    responseFormat: formAnswerResponseFormat,
  });
  const parsed = AiFallbackSchema.parse(parseJsonResponse(response.text));
  const normalizedAnswer = normalizeAnswerForQuestion(input.question, parsed.answer);
  const confidence = Math.max(0.2, Math.min(0.75, parsed.confidence ?? 0.58));

  return {
    questionType: input.classified.type,
    strategy: "generated",
    answer: normalizedAnswer,
    confidence,
    confidenceLabel: labelConfidence(confidence),
    source: "llm",
    notes: [
      "Resolved through AI fallback using candidate profile and resume evidence.",
      ...(parsed.notes ?? []),
    ],
  };
}
