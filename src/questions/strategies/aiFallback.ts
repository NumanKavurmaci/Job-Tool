import { z } from "zod";
import { labelConfidence } from "../../answers/confidence.js";
import type { ResolvedAnswer } from "../../answers/types.js";
import type { CandidateProfile } from "../../candidate/types.js";
import { completePrompt } from "../../llm/completePrompt.js";
import { parseJsonResponse } from "../../llm/json.js";
import type { ClassifiedQuestion, InputQuestion } from "../types.js";

const AiFallbackSchema = z.object({
  answer: z.union([z.string(), z.boolean(), z.null()]),
  confidence: z.number().min(0).max(1).optional(),
  notes: z.array(z.string()).optional(),
});

function summarizeProfile(profile: CandidateProfile): string {
  return [
    `Name: ${profile.fullName ?? "Unknown"}`,
    `Location: ${profile.location ?? "Unknown"}`,
    `Current title: ${profile.currentTitle ?? "Unknown"}`,
    `Summary: ${profile.summary ?? "Unknown"}`,
    `Total years of experience: ${profile.yearsOfExperienceTotal ?? "Unknown"}`,
    `Skills: ${profile.skills.join(", ") || "None listed"}`,
    `Preferred tech stack: ${profile.preferredTechStack.join(", ") || "None listed"}`,
    `Languages: ${profile.languages.join(", ") || "None listed"}`,
    `Work authorization: ${profile.workAuthorization ?? "Unknown"}`,
    `Requires sponsorship: ${profile.requiresSponsorship == null ? "Unknown" : String(profile.requiresSponsorship)}`,
    `Willing to relocate: ${profile.willingToRelocate == null ? "Unknown" : String(profile.willingToRelocate)}`,
    `Remote preference: ${profile.remotePreference ?? "Unknown"}`,
    `LinkedIn URL: ${profile.linkedinUrl ?? "Unknown"}`,
    `GitHub URL: ${profile.githubUrl ?? "Unknown"}`,
    `Portfolio URL: ${profile.portfolioUrl ?? "Unknown"}`,
    `GPA: ${profile.gpa ?? "Unknown"}`,
    `Salary expectation (generic): ${profile.salaryExpectation ?? "Unknown"}`,
    `Salary expectation USD: ${profile.salaryExpectations.usd ?? "Unknown"}`,
    `Salary expectation EUR: ${profile.salaryExpectations.eur ?? "Unknown"}`,
    `Salary expectation TRY: ${profile.salaryExpectations.try ?? "Unknown"}`,
    `Accessibility disclosure preference: ${profile.disability.disclosurePreference}`,
    "Experience highlights:",
    profile.experience
      .slice(0, 5)
      .map((item) =>
        `- ${item.title} at ${item.company}: ${item.summary ?? "No summary"} (${item.technologies.join(", ")})`,
      )
      .join("\n") || "- None listed",
    "Resume text excerpt:",
    profile.resumeText.slice(0, 4000) || "No resume text available",
  ].join("\n");
}

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

    const partial = options.find((option) =>
      option.toLowerCase().includes(answer.trim().toLowerCase()),
    );
    return partial ?? answer;
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
  const prompt = `
Answer this job application question using only the candidate profile and resume evidence provided.

Rules:
- Return JSON only
- Do not invent experience that is not supported by the profile or resume
- If a technology is not present in the profile or resume, years of experience should be 0
- If the question is yes/no and evidence is incomplete, choose the most conservative answer supported by the profile
- If options are provided, prefer one of those options exactly
- For text answers, keep the answer concise and form-ready
- For numeric questions, return a plain number as a string
- Never mention uncertainty in the answer itself

Question metadata:
Label: ${input.question.label}
Help text: ${input.question.helpText ?? "None"}
Placeholder: ${input.question.placeholder ?? "None"}
Input type: ${input.question.inputType}
Options: ${input.question.options?.join(" | ") ?? "None"}
Classified type: ${input.classified.type}
Normalized text: ${input.classified.normalizedText}

Job context:
Title: ${input.job?.title ?? "Unknown"}
Company: ${input.job?.company ?? "Unknown"}
Location: ${input.job?.location ?? "Unknown"}

Previous attempt:
${stringifyPreviousAttempt(input.previousAttempt)}

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
