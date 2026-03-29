export type QuestionType =
  | "contact_info"
  | "linkedin"
  | "location"
  | "work_authorization"
  | "sponsorship"
  | "remote_preference"
  | "accessibility"
  | "relocation"
  | "salary"
  | "gpa"
  | "years_of_experience"
  | "skill_experience"
  | "education"
  | "availability"
  | "cover_letter"
  | "motivation_short_text"
  | "general_short_text"
  | "unknown";

export interface InputQuestion {
  label: string;
  helpText?: string | null;
  placeholder?: string | null;
  inputType: string;
  options?: string[];
}

export interface ClassifiedQuestion {
  type: QuestionType;
  normalizedText: string;
  confidence: number;
}
