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
  precursorLinks: {
    label: string;
    href: string;
  }[];
  followedPrecursorLink: string | null;
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
