import { normalizeQuestion } from "./normalizeQuestion.js";
import type { ClassifiedQuestion, InputQuestion, QuestionType } from "./types.js";

type Rule = {
  type: QuestionType;
  patterns: RegExp[];
  confidence: number;
};

const RULES: Rule[] = [
  { type: "linkedin", patterns: [/linkedin/], confidence: 0.99 },
  { type: "work_authorization", patterns: [/authorized to work/, /work authorization/, /legally authorized/], confidence: 0.97 },
  { type: "sponsorship", patterns: [/sponsorship/, /require visa/], confidence: 0.97 },
  { type: "remote_preference", patterns: [/remote/, /work remotely/, /hybrid/, /on-site/, /onsite/, /work arrangement/], confidence: 0.95 },
  { type: "accessibility", patterns: [/accommodation/, /disability/, /disabled/, /reasonable accommodation/, /access needs/], confidence: 0.96 },
  { type: "relocation", patterns: [/relocate/, /relocation/], confidence: 0.95 },
  { type: "salary", patterns: [/salary/, /compensation/, /expected pay/], confidence: 0.95 },
  { type: "gpa", patterns: [/\bgpa\b/, /grade point average/], confidence: 0.97 },
  { type: "years_of_experience", patterns: [/how many years/, /years of experience/], confidence: 0.93 },
  { type: "skill_experience", patterns: [/experience with/, /familiar with/, /which .* used/], confidence: 0.88 },
  { type: "education", patterns: [/degree/, /education/, /university/, /graduat/], confidence: 0.9 },
  { type: "availability", patterns: [/start date/, /available/, /notice period/], confidence: 0.88 },
  { type: "location", patterns: [/location/, /where are you based/, /current city/], confidence: 0.88 },
  { type: "contact_info", patterns: [/email/, /phone/, /contact/, /first name/, /last name/, /full name/, /address/], confidence: 0.92 },
  { type: "cover_letter", patterns: [/cover letter/, /application letter/], confidence: 0.98 },
  { type: "motivation_short_text", patterns: [/why are you interested/, /why this role/, /why do you want/], confidence: 0.9 },
  { type: "general_short_text", patterns: [/describe/, /tell us about/, /briefly explain/], confidence: 0.72 },
];

export function classifyQuestion(question: InputQuestion): ClassifiedQuestion {
  const normalizedText = normalizeQuestion(question);

  for (const rule of RULES) {
    if (rule.patterns.some((pattern) => pattern.test(normalizedText))) {
      return {
        type: rule.type,
        normalizedText,
        confidence: rule.confidence,
      };
    }
  }

  return {
    type: "unknown",
    normalizedText,
    confidence: 0.2,
  };
}
