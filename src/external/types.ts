import type { InputQuestion } from "../questions/types.js";

export type ExternalApplicationFieldType =
  | "short_text"
  | "long_text"
  | "number"
  | "email"
  | "phone"
  | "url"
  | "single_select"
  | "multi_select"
  | "boolean"
  | "file"
  | "unknown";

export type ExternalApplicationFieldSemanticKey =
  | "salary.amount"
  | "salary.currency"
  | "salary.period"
  | "work.authorization"
  | "sponsorship.required"
  | "sponsorship.details"
  | "relocation.willing"
  | "location.city"
  | "phone.country_code"
  | "phone.number"
  | "profile.linkedin"
  | "profile.github"
  | "profile.portfolio"
  | "experience.years"
  | "consent.sms"
  | "consent.privacy"
  | "resume.upload"
  | "cover_letter.text"
  | "cover_letter.upload";

export type ExternalApplicationFieldSemanticConfidence = "high" | "medium" | "low";

export type ExternalApplicationField = {
  key: string;
  label: string;
  type: ExternalApplicationFieldType;
  semanticKey?: ExternalApplicationFieldSemanticKey | undefined;
  semanticSignals?: string[] | undefined;
  semanticConfidence?: ExternalApplicationFieldSemanticConfidence | undefined;
  selectorHints?: string[] | undefined;
  required: boolean;
  options: string[];
  placeholder: string | null;
  helpText: string | null;
  accept: string | null;
};

export type ExternalApplicationDiscovery = {
  sourceUrl: string;
  finalUrl: string;
  pageTitle: string;
  platform: string;
  fields: ExternalApplicationField[];
  precursorPage: boolean;
  precursorSignals: string[];
  precursorLinks: {
    label: string;
    href: string;
  }[];
  followedPrecursorLink: string | null;
};

export type ExternalAiCorrectionAttempt = {
  fieldKey: string;
  fieldLabel: string;
  validationFeedback: string;
  previousAnswer: string;
  correctedAnswer: string | null;
  outcome: "not_attempted" | "same_answer" | "retry_succeeded" | "retry_failed" | "repair_failed";
  finalFeedback?: string | null;
};

export type ExternalApplicationPlannedAnswer = {
  fieldKey: string;
  fieldLabel: string;
  fieldType: ExternalApplicationFieldType;
  semanticKey?: ExternalApplicationFieldSemanticKey | undefined;
  question: InputQuestion;
  answer: string | null;
  source: string;
  confidenceLabel: string;
  resolutionStrategy?: string | undefined;
  notes?: string;
};

export type ExternalApplicationStepSnapshot = {
  stepIndex: number;
  pageTitle: string;
  finalUrl: string;
  fieldCount: number;
  fieldKeys: string[];
  answerPlanCount: number;
  filledCount: number;
  blockingRequiredFields: string[];
  primaryAction: "next" | "submit" | "unknown";
  advanced: boolean;
  finalStage: string;
  stopReason: string;
  siteFeedback: {
    errors: string[];
    warnings: string[];
    infos: string[];
  };
};
