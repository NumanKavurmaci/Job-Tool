import { z } from "zod";
import { labelConfidence } from "../../answers/confidence.js";
import type { ResolvedAnswer } from "../../answers/types.js";
import type { CandidateProfile } from "../../candidate/types.js";
import { completePrompt } from "../../llm/completePrompt.js";
import { parseJsonResponse } from "../../llm/json.js";
import type { InputQuestion } from "../types.js";

const AiCorrectionSchema = z.object({
  answer: z.union([z.string(), z.boolean(), z.null()]),
  confidence: z.number().min(0).max(1).optional(),
  notes: z.array(z.string()).optional(),
});

// Keeps the repair prompt grounded in a compact but useful slice of the candidate profile.
function summarizeProfile(profile: CandidateProfile): string {
  return [
    `Name: ${profile.fullName ?? "Unknown"}`,
    `Location: ${profile.location ?? "Unknown"}`,
    `Current title: ${profile.currentTitle ?? "Unknown"}`,
    `Total years of experience: ${profile.yearsOfExperienceTotal ?? "Unknown"}`,
    `Skills: ${profile.skills.join(", ") || "None listed"}`,
    `Languages: ${profile.languages.join(", ") || "None listed"}`,
    `LinkedIn URL: ${profile.linkedinUrl ?? "Unknown"}`,
    `Portfolio URL: ${profile.portfolioUrl ?? "Unknown"}`,
    `GPA: ${profile.gpa ?? "Unknown"}`,
    `Salary expectation USD: ${profile.salaryExpectations?.usd ?? "Unknown"}`,
    `Salary expectation EUR: ${profile.salaryExpectations?.eur ?? "Unknown"}`,
    `Salary expectation TRY: ${profile.salaryExpectations?.try ?? "Unknown"}`,
    "Resume text excerpt:",
    profile.resumeText.slice(0, 3000) || "No resume text available",
  ].join("\n");
}

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

    const partial = options.find((option) =>
      option.toLowerCase().includes(answer.trim().toLowerCase()),
    );
    return partial ?? answer.trim();
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
  const prompt = `
You are correcting a job application field value after the website rejected the previous answer.

Rules:
- Return JSON only
- Use the site feedback to correct the answer
- Keep the corrected answer concise and form-ready
- For numeric fields, return only a plain numeric string
- If the site feedback requires a positive decimal or number, satisfy that exactly
- If options are available, prefer one exact option
- Do not explain in the answer itself
- If you cannot safely repair the value, return null

Question metadata:
Label: ${input.question.label}
Help text: ${input.question.helpText ?? "None"}
Placeholder: ${input.question.placeholder ?? "None"}
Input type: ${input.question.inputType}
Options: ${input.question.options?.join(" | ") ?? "None"}

Rejected answer:
${input.previousAnswer.answer == null ? "null" : typeof input.previousAnswer.answer === "string" ? input.previousAnswer.answer : JSON.stringify(input.previousAnswer.answer)}

Site feedback:
${input.validationFeedback}

Page context:
Title: ${input.pageContext?.title ?? "Unknown"}
Source URL: ${input.pageContext?.sourceUrl ?? "Unknown"}
Text excerpt: ${(input.pageContext?.text ?? "None").slice(0, 1500)}

Candidate profile:
${summarizeProfile(input.candidateProfile)}

Return this JSON schema:
{
  "answer": string | boolean | null,
  "confidence": number,
  "notes": string[]
}
  `.trim();

  const response = await completePrompt(prompt);
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
