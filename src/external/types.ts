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

export type ExternalApplicationField = {
  key: string;
  label: string;
  type: ExternalApplicationFieldType;
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
  question: InputQuestion;
  answer: string | null;
  source: string;
  confidenceLabel: string;
  notes?: string;
};
