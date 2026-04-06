import type { CandidateProfile } from "../candidate/types.js";
import type {
  ExternalApplicationField,
  ExternalApplicationFieldSemanticConfidence,
  ExternalApplicationFieldSemanticKey,
} from "./types.js";

type SemanticAnalysis = {
  semanticKey?: ExternalApplicationFieldSemanticKey | undefined;
  semanticSignals: string[];
  semanticConfidence?: ExternalApplicationFieldSemanticConfidence | undefined;
};

function normalizeSemanticText(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

function pushSignal(signals: string[], condition: boolean, signal: string) {
  if (condition && !signals.includes(signal)) {
    signals.push(signal);
  }
}

function buildCombinedFieldText(
  field: Pick<ExternalApplicationField, "key" | "label" | "placeholder" | "helpText" | "options">,
): string {
  return [
    field.key,
    field.label,
    field.placeholder,
    field.helpText,
    ...field.options,
  ]
    .map((value) => normalizeSemanticText(value))
    .filter(Boolean)
    .join(" ");
}

function selectConfidence(
  signals: string[],
  highThreshold: number,
  mediumThreshold: number,
): ExternalApplicationFieldSemanticConfidence | undefined {
  if (signals.length >= highThreshold) {
    return "high";
  }
  if (signals.length >= mediumThreshold) {
    return "medium";
  }
  return signals.length > 0 ? "low" : undefined;
}

function findOptionByKeywords(options: string[], keywords: string[]): string | null {
  const normalizedOptions = options.map((option) => ({
    raw: option,
    normalized: normalizeSemanticText(option),
  }));

  for (const keyword of keywords) {
    const match = normalizedOptions.find((option) => option.normalized.includes(keyword));
    if (match) {
      return match.raw;
    }
  }

  return null;
}

function isSensitiveDisclosureField(field: ExternalApplicationField): boolean {
  const combined = buildCombinedFieldText(field);
  return includesAny(combined, [
    "gender",
    "pronoun",
    "ethnicity",
    "race",
    "racial",
    "veteran",
    "disability",
    "sexual orientation",
    "lgbt",
    "demographic",
    "self identify",
    "self-identify",
  ]);
}

function findSensitiveDisclosureOptOutAnswer(field: ExternalApplicationField): string | null {
  if (!isSensitiveDisclosureField(field)) {
    return null;
  }

  const explicitOptOut =
    findOptionByKeywords(field.options, [
      "prefer not to say",
      "prefer not to disclose",
      "do not wish to answer",
      "don't wish to answer",
      "decline to state",
      "choose not to self-identify",
      "choose not to answer",
      "not specified",
      "not disclose",
    ]) ?? null;

  if (explicitOptOut) {
    return explicitOptOut;
  }

  if (field.type === "single_select" || field.type === "boolean") {
    return "I don't wish to answer";
  }

  return null;
}

function findDemographicAnswerFromProfile(
  field: ExternalApplicationField,
  candidateProfile: CandidateProfile,
): string | null {
  const combined = buildCombinedFieldText(field);
  const demographics = candidateProfile.demographics;

  if (includesAny(combined, ["pronoun"])) {
    return demographics.pronouns;
  }

  if (includesAny(combined, ["gender"])) {
    return demographics.gender;
  }

  if (includesAny(combined, ["sexual orientation", "orientation", "lgbt"])) {
    return demographics.sexualOrientation;
  }

  if (includesAny(combined, ["veteran", "military", "martyr family", "sehit", "gazi"])) {
    return demographics.veteranStatus;
  }

  if (includesAny(combined, ["ethnicity", "ethnic"])) {
    return demographics.ethnicity;
  }

  if (includesAny(combined, ["race", "racial"])) {
    return demographics.race;
  }

  return null;
}

function parseCompensationNumber(value: string | null | undefined): number | null {
  const normalized = String(value ?? "").replace(/[^0-9.,]/g, "").replace(/,/g, "");
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCompensationNumber(value: number): string {
  return String(Math.round(value));
}

function inferSalaryContext(field: ExternalApplicationField): {
  preferredCurrency: "TRY" | "EUR" | "USD" | null;
  preferredPeriod: "monthly" | "yearly";
} {
  const combined = buildCombinedFieldText(field);
  const preferredCurrency = combined.includes("usd")
    ? "USD"
    : combined.includes("eur") || combined.includes("euro")
      ? "EUR"
      : combined.includes("try") || combined.includes("turkish lira") || combined.includes(" tl ")
        ? "TRY"
        : null;
  const preferredPeriod =
    includesAny(combined, ["per month", "monthly", "month"]) ? "monthly" : "yearly";

  return { preferredCurrency, preferredPeriod };
}

function extractCityFromLocation(location: string | null | undefined): string | null {
  const normalized = String(location ?? "").trim();
  if (!normalized) {
    return null;
  }

  return normalized
    .replace(/\bTürkiye\b/gi, "Turkey")
    .replace(/\bTurkiye\b/gi, "Turkey")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePhoneNumberForLocalField(phone: string | null | undefined): string | null {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) {
    return null;
  }

  if (digits.startsWith("90") && digits.length > 10) {
    return digits.slice(2);
  }

  return digits;
}

function findBooleanStyleOption(options: string[], desired: boolean): string | null {
  const positiveKeywords = [
    "yes",
    "authorized",
    "i am",
    "i do",
    "allowed",
    "available",
    "willing",
    "agree",
    "accept",
    "opt in",
    "consent",
  ];
  const negativeKeywords = [
    "no",
    "not",
    "require sponsorship",
    "need sponsorship",
    "not authorized",
    "opt out",
    "decline",
    "disagree",
  ];

  return findOptionByKeywords(options, desired ? positiveKeywords : negativeKeywords);
}

function findWorkAuthorizationOption(options: string[], workAuthorization: string): string | null {
  const normalizedAnswer = normalizeSemanticText(workAuthorization);
  const normalizedOptions = options.map((option) => ({
    raw: option,
    normalized: normalizeSemanticText(option),
  }));

  const exact = normalizedOptions.find((option) => option.normalized === normalizedAnswer);
  if (exact) {
    return exact.raw;
  }

  const subset = normalizedOptions.find(
    (option) =>
      normalizedAnswer.includes(option.normalized) || option.normalized.includes(normalizedAnswer),
  );
  if (subset) {
    return subset.raw;
  }

  if (
    /without sponsorship|no sponsorship|authorized to work|work permit not required/.test(
      normalizedAnswer,
    )
  ) {
    return (
      findOptionByKeywords(options, [
        "without sponsorship",
        "do not require sponsorship",
        "authorized",
        "no sponsorship",
      ]) ?? findBooleanStyleOption(options, true)
    );
  }

  if (/require sponsorship|need sponsorship|visa required/.test(normalizedAnswer)) {
    return (
      findOptionByKeywords(options, [
        "require sponsorship",
        "need sponsorship",
        "visa",
      ]) ?? findBooleanStyleOption(options, false)
    );
  }

  return null;
}

function inferRegionFromPageContext(pageContext?: {
  title?: string | null;
  text?: string | null;
  sourceUrl?: string | null;
} | null): "turkey" | "europe" | "unknown" {
  const combined = normalizeSemanticText(
    [pageContext?.title, pageContext?.text, pageContext?.sourceUrl].filter(Boolean).join(" "),
  );

  if (includesAny(combined, ["turkey", "türkiye", "istanbul", "ankara", "izmir", "samsun"])) {
    return "turkey";
  }

  if (
    includesAny(combined, [
      "europe",
      "european union",
      "eu",
      "germany",
      "berlin",
      "portugal",
      "spain",
      "france",
      "netherlands",
      "poland",
      "romania",
      "italy",
    ])
  ) {
    return "europe";
  }

  return "unknown";
}

function resolveRegionalSponsorshipPreference(args: {
  candidateProfile: CandidateProfile;
  pageContext?: {
    title?: string | null;
    text?: string | null;
    sourceUrl?: string | null;
  } | null;
}): boolean | null {
  const region = inferRegionFromPageContext(args.pageContext);
  const regional = args.candidateProfile.regionalAuthorization;

  if (regional) {
    if (region === "turkey" && regional.turkeyRequiresSponsorship != null) {
      return regional.turkeyRequiresSponsorship;
    }
    if (region === "europe" && regional.europeRequiresSponsorship != null) {
      return regional.europeRequiresSponsorship;
    }
    if (regional.defaultRequiresSponsorship != null) {
      return regional.defaultRequiresSponsorship;
    }
  }

  return args.candidateProfile.requiresSponsorship ?? null;
}

function analyzeSalarySemantics(field: ExternalApplicationField, combined: string): SemanticAnalysis | null {
  if (!/salary|compensation|pay|annual compensation/.test(combined)) {
    return null;
  }

  const signals: string[] = [];
  const normalizedOptions = field.options.map((option) => normalizeSemanticText(option));
  const looksLikePeriodOptions =
    normalizedOptions.length > 0 &&
    normalizedOptions.every((option) =>
      ["hourly", "weekly", "monthly", "yearly", "annually", "daily"].includes(option),
    );
  const looksLikeCurrencyOptions =
    normalizedOptions.length > 1 &&
    (normalizedOptions.some((option) => option.includes("dollar")) ||
      normalizedOptions.some((option) => option.includes("euro")) ||
      normalizedOptions.some((option) => option.includes("lira")) ||
      normalizedOptions.some((option) => /^[a-z]{3}$/.test(option)));

  pushSignal(signals, field.key.toLowerCase().includes("salary"), "key:salary");
  pushSignal(signals, field.label.toLowerCase().includes("salary"), "label:salary");
  pushSignal(signals, looksLikeCurrencyOptions || field.key.toLowerCase().includes("currency"), "options:currency");
  pushSignal(signals, looksLikePeriodOptions, "options:period");
  pushSignal(signals, /desired salary/.test(combined), "context:desired-salary");

  if (looksLikePeriodOptions) {
    return {
      semanticKey: "salary.period",
      semanticSignals: signals,
      semanticConfidence: selectConfidence(signals, 2, 1),
    };
  }

  if (looksLikeCurrencyOptions || field.key.toLowerCase().includes("currency")) {
    return {
      semanticKey: "salary.currency",
      semanticSignals: signals,
      semanticConfidence: selectConfidence(signals, 2, 1),
    };
  }

  return {
    semanticKey: "salary.amount",
    semanticSignals: signals,
    semanticConfidence: selectConfidence(signals, 2, 1),
  };
}

function analyzeResumeSemantics(field: ExternalApplicationField, combined: string): SemanticAnalysis | null {
  if (field.type !== "file") {
    return null;
  }

  const signals: string[] = [];
  pushSignal(signals, /resume|cv/.test(combined), "text:resume");
  pushSignal(signals, /upload resume/.test(combined), "cta:upload-resume");

  if (signals.length === 0) {
    return null;
  }

  return {
    semanticKey: "resume.upload",
    semanticSignals: signals,
    semanticConfidence: selectConfidence(signals, 2, 1),
  };
}

function analyzeCoverLetterSemantics(
  field: ExternalApplicationField,
  combined: string,
): SemanticAnalysis | null {
  if (!/cover letter/.test(combined)) {
    return null;
  }

  const signals: string[] = [];
  pushSignal(signals, /cover letter/.test(normalizeSemanticText(field.label)), "label:cover-letter");
  pushSignal(signals, field.type === "file", "type:file");
  pushSignal(signals, field.type === "long_text" || field.type === "short_text", "type:text");

  return {
    semanticKey: field.type === "file" ? "cover_letter.upload" : "cover_letter.text",
    semanticSignals: signals,
    semanticConfidence: selectConfidence(signals, 2, 1),
  };
}

function analyzeConsentSemantics(field: ExternalApplicationField, combined: string): SemanticAnalysis | null {
  const signals: string[] = [];
  pushSignal(signals, /sms/.test(combined), "text:sms");
  pushSignal(signals, /text messages|message rates|reply stop|application via sms/.test(combined), "text:sms-copy");
  pushSignal(signals, /privacy|terms|policy|gdpr|data processing/.test(combined), "text:privacy");
  pushSignal(signals, field.type === "boolean", "type:boolean");

  if (signals.includes("text:sms") || signals.includes("text:sms-copy")) {
    return {
      semanticKey: "consent.sms",
      semanticSignals: signals,
      semanticConfidence: selectConfidence(signals, 3, 2),
    };
  }

  if (signals.includes("text:privacy")) {
    return {
      semanticKey: "consent.privacy",
      semanticSignals: signals,
      semanticConfidence: selectConfidence(signals, 2, 1),
    };
  }

  return null;
}

// Infers a single semantic key without mutating the full field object.
export function inferSemanticKey(
  field: Pick<ExternalApplicationField, "key" | "label" | "placeholder" | "helpText" | "options" | "type">,
): ExternalApplicationFieldSemanticKey | undefined {
  return analyzeFieldSemantics(field as ExternalApplicationField).semanticKey;
}

// Central semantic classifier for external application fields.
export function analyzeFieldSemantics(field: ExternalApplicationField): SemanticAnalysis {
  const combined = buildCombinedFieldText(field);

  const salary = analyzeSalarySemantics(field, combined);
  if (salary) {
    return salary;
  }

  const resume = analyzeResumeSemantics(field, combined);
  if (resume) {
    return resume;
  }

  const coverLetter = analyzeCoverLetterSemantics(field, combined);
  if (coverLetter) {
    return coverLetter;
  }

  const consent = analyzeConsentSemantics(field, combined);
  if (consent) {
    return consent;
  }

  const signals: string[] = [];
  pushSignal(signals, includesAny(combined, [
    "authorized to work",
    "work authorization",
    "work permit",
    "legally authorized",
    "eligible to work",
  ]), "text:work-authorization");
  if (signals.length > 0) {
    return {
      semanticKey: "work.authorization",
      semanticSignals: signals,
      semanticConfidence: selectConfidence(signals, 1, 1),
    };
  }

  pushSignal(signals, includesAny(combined, [
    "sponsorship",
    "require visa",
    "need visa",
    "need sponsorship",
    "requires sponsorship",
    "work visa",
    "sponsorworkvisa",
  ]), "text:sponsorship");
  if (signals.includes("text:sponsorship")) {
    const looksLikeDetailsField = includesAny(combined, [
      "provide more details",
      "support you",
      "details",
      "tell us more",
      "additional information",
      "additional details",
      "sponsorworkvisadetails",
    ]) && !includesAny(combined, [
      "require sponsorship now or in the future",
      "do you require sponsorship",
      "will you require sponsorship",
    ]);
    if (looksLikeDetailsField) {
      return {
        semanticKey: "sponsorship.details",
        semanticSignals: [...signals, "text:sponsorship-details"],
        semanticConfidence: selectConfidence([...signals, "text:sponsorship-details"], 2, 1),
      };
    }
    return {
      semanticKey: "sponsorship.required",
      semanticSignals: [...signals],
      semanticConfidence: selectConfidence(signals, 1, 1),
    };
  }

  pushSignal(signals, includesAny(combined, ["relocate", "relocation", "willing to move"]), "text:relocation");
  if (signals.includes("text:relocation")) {
    return {
      semanticKey: "relocation.willing",
      semanticSignals: [...signals],
      semanticConfidence: selectConfidence(signals, 1, 1),
    };
  }

  pushSignal(signals, includesAny(combined, ["city of residence", "city", "current city"]), "text:city");
  if (signals.includes("text:city") && !includesAny(combined, ["countrycode", "country code"])) {
    return {
      semanticKey: "location.city",
      semanticSignals: [...signals],
      semanticConfidence: selectConfidence(signals, 1, 1),
    };
  }

  pushSignal(signals, includesAny(combined, ["countrycode", "country code", "dial code", "phone code"]), "text:phone-country-code");
  if (signals.includes("text:phone-country-code")) {
    return {
      semanticKey: "phone.country_code",
      semanticSignals: [...signals],
      semanticConfidence: selectConfidence(signals, 1, 1),
    };
  }

  pushSignal(signals, includesAny(combined, ["phone number", "phone", "mobile", "telephone"]), "text:phone-number");
  if (signals.includes("text:phone-number")) {
    return {
      semanticKey: "phone.number",
      semanticSignals: [...signals],
      semanticConfidence: selectConfidence(signals, 1, 1),
    };
  }

  pushSignal(signals, includesAny(combined, ["linkedin profile", "linkedin url", "linkedin"]), "text:linkedin");
  if (signals.includes("text:linkedin")) {
    return {
      semanticKey: "profile.linkedin",
      semanticSignals: [...signals],
      semanticConfidence: selectConfidence(signals, 1, 1),
    };
  }

  pushSignal(signals, includesAny(combined, ["github", "git hub"]), "text:github");
  if (signals.includes("text:github")) {
    return {
      semanticKey: "profile.github",
      semanticSignals: [...signals],
      semanticConfidence: selectConfidence(signals, 1, 1),
    };
  }

  pushSignal(signals, includesAny(combined, ["portfolio", "personal website", "website", "site url"]), "text:portfolio");
  if (signals.includes("text:portfolio")) {
    return {
      semanticKey: "profile.portfolio",
      semanticSignals: [...signals],
      semanticConfidence: selectConfidence(signals, 1, 1),
    };
  }

  pushSignal(signals, includesAny(combined, ["years of experience", "years experience", "yoe"]), "text:experience-years");
  if (signals.includes("text:experience-years")) {
    return {
      semanticKey: "experience.years",
      semanticSignals: [...signals],
      semanticConfidence: selectConfidence(signals, 1, 1),
    };
  }

  return {
    semanticSignals: [],
  };
}

// Annotates discovered fields with semantic meaning and select coercions for tricky widgets.
export function annotateSemanticFields(fields: ExternalApplicationField[]): ExternalApplicationField[] {
  return fields.map((field) => {
    const analysis = analyzeFieldSemantics(field);
    if (!analysis.semanticKey) {
      return field;
    }

    const looksLikeReactSelect =
      field.key.startsWith("react-select-") ||
      (field.selectorHints ?? []).some((hint) => hint.includes("react-select-"));
    const semanticSelectLike =
      looksLikeReactSelect &&
      ["sponsorship.required", "work.authorization", "relocation.willing", "phone.country_code"].includes(
        analysis.semanticKey,
      );

    return {
      ...field,
      semanticKey: analysis.semanticKey,
      semanticSignals: analysis.semanticSignals,
      semanticConfidence: analysis.semanticConfidence,
      type:
        analysis.semanticKey === "salary.currency" ||
        analysis.semanticKey === "salary.period" ||
        semanticSelectLike
          ? "single_select"
          : field.type,
    };
  });
}

// Resolves structured answers for semantically recognized external fields before LLM fallback runs.
export function resolveSemanticExternalAnswer(args: {
  field: ExternalApplicationField;
  candidateProfile: CandidateProfile;
  pageContext?: {
    title?: string | null;
    text?: string | null;
    sourceUrl?: string | null;
  } | null;
}): {
  answer: string | null;
  source: string;
  confidenceLabel: string;
  resolutionStrategy?: string;
  notes?: string;
} | null {
  const demographicAnswer = findDemographicAnswerFromProfile(args.field, args.candidateProfile);
  if (demographicAnswer) {
    return {
      answer: demographicAnswer,
      source: "candidate-profile",
      confidenceLabel: "high",
      resolutionStrategy: "profile:demographics",
      notes: "Resolved from the candidate's saved demographics preferences.",
    };
  }

  const sensitiveOptOutAnswer = findSensitiveDisclosureOptOutAnswer(args.field);
  if (sensitiveOptOutAnswer) {
    return {
      answer: sensitiveOptOutAnswer,
      source: "policy",
      confidenceLabel: "high",
      resolutionStrategy: "policy:sensitive-disclosure-opt-out",
      notes:
        "Sensitive demographic/disclosure field auto-resolved to the form's explicit opt-out answer when available.",
    };
  }

  switch (args.field.semanticKey) {
    case "salary.amount": {
      const salaryContext = inferSalaryContext(args.field);
      const structuredAmount =
        salaryContext.preferredCurrency === "USD"
          ? args.candidateProfile.salaryExpectations.usd
          : salaryContext.preferredCurrency === "EUR"
            ? args.candidateProfile.salaryExpectations.eur
            : salaryContext.preferredCurrency === "TRY"
              ? args.candidateProfile.salaryExpectations.try
              : args.candidateProfile.salaryExpectations.try ??
                args.candidateProfile.salaryExpectations.eur ??
                args.candidateProfile.salaryExpectations.usd ??
                null;
      const parsedAmount = parseCompensationNumber(structuredAmount);
      const normalizedAmount =
        parsedAmount == null
          ? structuredAmount
          : salaryContext.preferredPeriod === "monthly" && parsedAmount >= 20000
            ? formatCompensationNumber(parsedAmount / 12)
            : formatCompensationNumber(parsedAmount);
      return {
        answer: normalizedAmount,
        source: "candidate-profile",
        confidenceLabel: normalizedAmount ? "high" : "manual_review",
        resolutionStrategy: "semantic:salary-amount",
        ...(normalizedAmount
          ? {
              notes:
                salaryContext.preferredPeriod === "monthly" && parsedAmount != null && parsedAmount >= 20000
                  ? "Resolved from candidate salary expectations and normalized to a monthly amount."
                  : "Resolved from candidate salary expectations.",
            }
          : { notes: "No structured salary amount was available in the candidate profile." }),
      };
    }
    case "salary.currency": {
      const preferredCurrency = args.candidateProfile.salaryExpectations.try
        ? { code: "TRY", aliases: ["turkish lira", "tl", "try"] }
        : args.candidateProfile.salaryExpectations.eur
          ? { code: "EUR", aliases: ["euro", "eur", "€"] }
          : args.candidateProfile.salaryExpectations.usd
            ? { code: "USD", aliases: ["us dollar", "dollar", "usd", "$"] }
            : null;
      const matchedOption =
        preferredCurrency == null
          ? null
          : (args.field.options.find((option) =>
              preferredCurrency.aliases.some((alias) =>
                normalizeSemanticText(option).includes(alias),
              ),
            ) ?? preferredCurrency.code);
      return {
        answer: matchedOption,
        source: "candidate-profile",
        confidenceLabel: matchedOption ? "high" : "manual_review",
        resolutionStrategy: "semantic:salary-currency",
        ...(matchedOption
          ? { notes: "Resolved from candidate salary expectation currency." }
          : { notes: "No salary expectation currency matched the available options." }),
      };
    }
    case "salary.period": {
      const period =
        args.field.options.find((option) =>
          ["yearly", "annually"].includes(normalizeSemanticText(option)),
        ) ??
        args.field.options[0] ??
        "Yearly";
      return {
        answer: period,
        source: "candidate-profile",
        confidenceLabel: "medium",
        resolutionStrategy: "semantic:salary-period",
        notes: "Defaulted salary period to a yearly amount for structured salary widgets.",
      };
    }
    case "work.authorization": {
      const rawAnswer = args.candidateProfile.workAuthorization;
      const matchedOption =
        rawAnswer && args.field.options.length > 0
          ? findWorkAuthorizationOption(args.field.options, rawAnswer)
          : rawAnswer;
      return {
        answer: matchedOption ?? rawAnswer,
        source: "candidate-profile",
        confidenceLabel: rawAnswer ? "high" : "manual_review",
        resolutionStrategy:
          args.field.options.length > 0
            ? "semantic:option-match:work-authorization"
            : "semantic:direct:work-authorization",
        ...(rawAnswer
          ? { notes: "Resolved from candidate work authorization profile." }
          : { notes: "No work authorization answer was available in the candidate profile." }),
      };
    }
    case "sponsorship.required": {
      const value = resolveRegionalSponsorshipPreference({
        candidateProfile: args.candidateProfile,
        ...(args.pageContext !== undefined ? { pageContext: args.pageContext } : {}),
      });
      const answer =
        value == null
          ? null
          : args.field.options.length > 0
            ? (findBooleanStyleOption(args.field.options, value) ?? (value ? "Yes" : "No"))
            : value
              ? "Yes"
              : "No";
      return {
        answer,
        source: "candidate-profile",
        confidenceLabel: value == null ? "manual_review" : "high",
        resolutionStrategy:
          args.field.options.length > 0
            ? "semantic:option-match:sponsorship"
            : "semantic:boolean:sponsorship",
        ...(value == null
          ? { notes: "No sponsorship preference was available in the candidate profile." }
          : {
              notes:
                inferRegionFromPageContext(args.pageContext) === "unknown"
                  ? "Resolved from the candidate's default regional sponsorship preference."
                  : `Resolved from the candidate's ${inferRegionFromPageContext(args.pageContext)} sponsorship preference.`,
            }),
      };
    }
    case "sponsorship.details": {
      const regional = args.candidateProfile.regionalAuthorization;
      const answer =
        regional?.turkeyRequiresSponsorship === false && regional?.europeRequiresSponsorship === true
          ? "I am based in Turkey and do not require sponsorship for roles in Turkey, but I would require visa sponsorship for roles based in Europe."
          : args.candidateProfile.requiresSponsorship === true
            ? "I would require visa sponsorship for this opportunity based on the role location and work authorization requirements."
            : args.candidateProfile.requiresSponsorship === false
              ? "I do not require visa sponsorship for this opportunity."
              : null;
      return {
        answer,
        source: "candidate-profile",
        confidenceLabel: answer ? "high" : "manual_review",
        resolutionStrategy: "semantic:sponsorship-details",
        ...(answer
          ? { notes: "Resolved from the candidate's regional sponsorship profile." }
          : { notes: "No structured sponsorship details were available in the candidate profile." }),
      };
    }
    case "relocation.willing": {
      const value = args.candidateProfile.willingToRelocate;
      const answer =
        value == null
          ? null
          : args.field.options.length > 0
            ? (findBooleanStyleOption(args.field.options, value) ?? (value ? "Yes" : "No"))
            : value
              ? "Yes"
              : "No";
      return {
        answer,
        source: "candidate-profile",
        confidenceLabel: value == null ? "manual_review" : "high",
        resolutionStrategy:
          args.field.options.length > 0
            ? "semantic:option-match:relocation"
            : "semantic:boolean:relocation",
        ...(value == null
          ? { notes: "No relocation preference was available in the candidate profile." }
          : { notes: "Resolved from candidate relocation preference." }),
      };
    }
    case "location.city": {
      const answer = extractCityFromLocation(args.candidateProfile.location);
      return {
        answer,
        source: "candidate-profile",
        confidenceLabel: answer ? "high" : "manual_review",
        resolutionStrategy: "semantic:location-city",
        ...(answer
          ? { notes: "Resolved from candidate city of residence in an autocomplete-friendly format." }
          : { notes: "No structured city value was available in the candidate profile." }),
      };
    }
    case "phone.country_code": {
      const normalizedLocation = normalizeSemanticText(args.candidateProfile.location);
      const normalizedPhone = normalizeSemanticText(args.candidateProfile.phone);
      const answer =
        includesAny(normalizedLocation, ["turkey", "türkiye"]) || normalizedPhone.startsWith("+90")
          ? "Turkey (+90)"
          : includesAny(normalizedLocation, ["germany", "deutschland"])
            ? "Germany (+49)"
            : includesAny(normalizedLocation, ["portugal"])
              ? "Portugal (+351)"
              : null;
      return {
        answer,
        source: "candidate-profile",
        confidenceLabel: answer ? "high" : "manual_review",
        resolutionStrategy: "semantic:phone-country-code",
        ...(answer
          ? { notes: "Resolved from candidate location and phone country code." }
          : { notes: "No structured phone country code could be inferred from the candidate profile." }),
      };
    }
    case "phone.number": {
      const pageText = normalizeSemanticText(
        [args.pageContext?.title, args.pageContext?.text, args.pageContext?.sourceUrl]
          .filter(Boolean)
          .join(" "),
      );
      const shouldUseLocalFormat = includesAny(pageText, ["+ 1", "countrycode", "country code"]);
      const answer = shouldUseLocalFormat
        ? normalizePhoneNumberForLocalField(args.candidateProfile.phone)
        : String(args.candidateProfile.phone ?? "").trim() || null;
      return {
        answer,
        source: "candidate-profile",
        confidenceLabel: answer ? "high" : "manual_review",
        resolutionStrategy: shouldUseLocalFormat
          ? "semantic:phone-local"
          : "semantic:phone-direct",
        ...(answer
          ? {
              notes: shouldUseLocalFormat
                ? "Resolved from candidate phone number and normalized to a local format because the form uses a separate country code control."
                : "Resolved from candidate phone number.",
            }
          : { notes: "No phone number was available in the candidate profile." }),
      };
    }
    case "profile.linkedin":
      return {
        answer: args.candidateProfile.linkedinUrl,
        source: "candidate-profile",
        confidenceLabel: args.candidateProfile.linkedinUrl ? "high" : "manual_review",
        resolutionStrategy: "semantic:profile-linkedin",
        ...(args.candidateProfile.linkedinUrl
          ? { notes: "Resolved from candidate LinkedIn profile URL." }
          : { notes: "No LinkedIn profile URL was available in the candidate profile." }),
      };
    case "profile.github":
      return {
        answer: args.candidateProfile.githubUrl,
        source: "candidate-profile",
        confidenceLabel: args.candidateProfile.githubUrl ? "high" : "manual_review",
        resolutionStrategy: "semantic:profile-github",
        ...(args.candidateProfile.githubUrl
          ? { notes: "Resolved from candidate GitHub profile URL." }
          : { notes: "No GitHub URL was available in the candidate profile." }),
      };
    case "profile.portfolio":
      return {
        answer: args.candidateProfile.portfolioUrl,
        source: "candidate-profile",
        confidenceLabel: args.candidateProfile.portfolioUrl ? "high" : "manual_review",
        resolutionStrategy: "semantic:profile-portfolio",
        ...(args.candidateProfile.portfolioUrl
          ? { notes: "Resolved from candidate portfolio URL." }
          : { notes: "No portfolio URL was available in the candidate profile." }),
      };
    case "experience.years":
      const normalizedYears =
        args.candidateProfile.yearsOfExperienceTotal == null
          ? null
          : String(Math.round(args.candidateProfile.yearsOfExperienceTotal));
      return {
        answer: normalizedYears,
        source: "candidate-profile",
        confidenceLabel: normalizedYears == null ? "manual_review" : "high",
        resolutionStrategy: "semantic:experience-years",
        ...(normalizedYears == null
          ? { notes: "No structured years-of-experience value was available." }
          : { notes: "Resolved from candidate years-of-experience total and normalized to a whole number." }),
      };
    case "resume.upload":
      return {
        answer: args.candidateProfile.sourceMetadata.resumePath ?? null,
        source: "candidate-profile",
        confidenceLabel: args.candidateProfile.sourceMetadata.resumePath ? "high" : "manual_review",
        resolutionStrategy: "semantic:resume-upload",
        ...(args.candidateProfile.sourceMetadata.resumePath
          ? { notes: "Will use the configured resume file for upload." }
          : { notes: "No resume path was available in the candidate profile." }),
      };
    case "consent.sms":
    case "consent.privacy":
      return {
        answer: args.field.required ? "Yes" : null,
        source: args.field.required ? "policy" : "manual",
        confidenceLabel: args.field.required ? "high" : "manual_review",
        resolutionStrategy: `semantic:${args.field.semanticKey}`,
        notes: args.field.required
          ? "Required consent field auto-accepted under the configured privacy-consent policy."
          : "Consent-style fields are intentionally left for explicit review unless a policy is configured.",
      };
    case "cover_letter.text":
    case "cover_letter.upload":
      return {
        answer: null,
        source: "manual",
        confidenceLabel: "manual_review",
        resolutionStrategy: `semantic:${args.field.semanticKey}`,
        notes: "Cover letter handling is intentionally conservative until a dedicated policy is configured.",
      };
    default:
      return null;
  }
}
