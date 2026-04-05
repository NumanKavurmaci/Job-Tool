import { existsSync } from "node:fs";
import type { Page } from "@playwright/test";
import type { CandidateProfile } from "../candidate/types.js";
import type {
  ExternalAiCorrectionAttempt,
  ExternalApplicationDiscovery,
  ExternalApplicationField,
  ExternalApplicationPlannedAnswer,
} from "./types.js";
import {
  createEmptySiteFeedbackSnapshot,
  mergeSiteFeedbackSnapshots,
  type SiteFeedbackSnapshot,
} from "../browser/siteFeedback.js";
import { repairAnswerFromSiteFeedback } from "../questions/strategies/aiCorrection.js";

export type ExternalFillStatus = "filled" | "skipped" | "failed";
export type ExternalPrimaryAction = "next" | "submit" | "unknown";

export type ExternalFieldFillResult = {
  fieldKey: string;
  fieldLabel: string;
  required: boolean;
  status: ExternalFillStatus;
  details: string;
};

export type ExternalFillResult = {
  fieldResults: ExternalFieldFillResult[];
  primaryAction: ExternalPrimaryAction;
  advanced: boolean;
  blockingRequiredFields: string[];
  siteFeedback: SiteFeedbackSnapshot;
  aiCorrectionAttempts: ExternalAiCorrectionAttempt[];
};

function escapeAttributeValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function pushUnique(target: string[], value: string | null | undefined) {
  if (!value || target.includes(value)) {
    return;
  }

  target.push(value);
}

function buildFieldSelectors(field: ExternalApplicationField): string[] {
  const selectors: string[] = [];

  pushUnique(selectors, `[id="${escapeAttributeValue(field.key)}"]`);
  pushUnique(selectors, `[name="${escapeAttributeValue(field.key)}"]`);

  if (field.label) {
    pushUnique(selectors, `input[aria-label="${escapeAttributeValue(field.label)}"]`);
    pushUnique(selectors, `textarea[aria-label="${escapeAttributeValue(field.label)}"]`);
    pushUnique(selectors, `select[aria-label="${escapeAttributeValue(field.label)}"]`);
    if (field.type === "file") {
      pushUnique(selectors, `input[type="file"][aria-label="${escapeAttributeValue(field.label)}"]`);
    }
  }

  if (field.placeholder) {
    pushUnique(selectors, `input[placeholder="${escapeAttributeValue(field.placeholder)}"]`);
    pushUnique(selectors, `textarea[placeholder="${escapeAttributeValue(field.placeholder)}"]`);
  }

  if (field.type === "file") {
    pushUnique(selectors, `input[type="file"]`);
    if (field.accept) {
      pushUnique(selectors, `input[type="file"][accept="${escapeAttributeValue(field.accept)}"]`);
    }
  }

  return selectors;
}

async function findFirstLocator(page: Page, selectors: string[]) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0) {
      return locator;
    }
  }

  return null;
}

function normalizeAnswerValue(answer: string | null): string {
  return answer?.trim() ?? "";
}

function normalizeUrlAnswer(answer: string): string {
  const trimmed = answer.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);
    return url.toString();
  } catch {
    try {
      return encodeURI(trimmed);
    } catch {
      return trimmed;
    }
  }
}

async function clickVisibleOption(page: Page, answer: string): Promise<boolean> {
  const optionSelectors = [
    `[title="${escapeAttributeValue(answer)}"]`,
    `.list-item:has-text("${escapeAttributeValue(answer)}")`,
    `[role="option"]:has-text("${escapeAttributeValue(answer)}")`,
    `[data-value="${escapeAttributeValue(answer)}"]`,
    `li:has-text("${escapeAttributeValue(answer)}")`,
  ];

  const locator = await findFirstLocator(page, optionSelectors);
  if (!locator) {
    return false;
  }

  await locator.click();
  return true;
}

// Fills a single external field and optionally retries once with an AI-corrected value.
async function fillSingleField(
  page: Page,
  field: ExternalApplicationField,
  plan: ExternalApplicationPlannedAnswer | undefined,
  candidateProfile: CandidateProfile,
  pageContext?: {
    title?: string | null;
    text?: string | null;
    sourceUrl?: string | null;
  },
): Promise<ExternalFieldFillResult> {
  const answer = normalizeAnswerValue(plan?.answer ?? null);
  if (!answer) {
    return {
      fieldKey: field.key,
      fieldLabel: field.label,
      required: field.required,
      status: "skipped",
      details: "No answer was available for this field.",
    };
  }

  const locator = await findFirstLocator(page, buildFieldSelectors(field));
  if (!locator) {
    return {
      fieldKey: field.key,
      fieldLabel: field.label,
      required: field.required,
      status: "failed",
      details: "Could not find a matching form control on the page.",
    };
  }

  try {
    if (field.type === "file") {
      if (!existsSync(answer)) {
        return {
          fieldKey: field.key,
          fieldLabel: field.label,
          required: field.required,
          status: "failed",
          details: `File does not exist: ${answer}`,
        };
      }

      await locator.setInputFiles(answer);
      return {
        fieldKey: field.key,
        fieldLabel: field.label,
        required: field.required,
        status: "filled",
        details: "Selected file for upload.",
      };
    }

    const fillValue = field.type === "url" ? normalizeUrlAnswer(answer) : answer;

    if (field.type === "single_select" || field.type === "multi_select" || field.type === "boolean") {
      await locator.click().catch(() => undefined);
      await page.waitForTimeout(150);
      const clickedOption = await clickVisibleOption(page, answer).catch(() => false);

      if (!clickedOption) {
        await locator.fill(answer);
        await locator.press("Enter").catch(() => undefined);
      }

      await locator.blur().catch(() => undefined);

      return {
        fieldKey: field.key,
        fieldLabel: field.label,
        required: field.required,
        status: "filled",
        details: clickedOption
          ? "Selected a visible option."
          : "Filled a selectable field.",
      };
    }

    await locator.fill(fillValue);
    await locator.blur().catch(() => undefined);

    const siteFeedback = await collectExternalSiteFeedback(page);
    if (siteFeedback.errors.length > 0) {
      const corrected = await repairAnswerFromSiteFeedback({
        question: plan?.question ?? {
          label: field.label,
          inputType: field.type,
          ...(field.options.length > 0 ? { options: field.options } : {}),
          ...(field.helpText ? { helpText: field.helpText } : {}),
          ...(field.placeholder ? { placeholder: field.placeholder } : {}),
        },
        candidateProfile,
        previousAnswer: {
          questionType: "general_short_text",
          strategy: "generated",
          answer,
          confidence: 0.5,
          confidenceLabel: "medium",
          source: plan?.source === "candidate-profile" ? "candidate-profile" : "llm",
        },
        validationFeedback: siteFeedback.errors[0]!,
        ...(pageContext ? { pageContext } : {}),
      }).catch(() => null);

      if (
        corrected &&
        typeof corrected.answer === "string" &&
        corrected.answer.trim() &&
        corrected.answer.trim() !== fillValue.trim()
      ) {
        await locator.fill(corrected.answer.trim());
        await locator.blur().catch(() => undefined);
        const correctedFeedback = await collectExternalSiteFeedback(page);
        if (correctedFeedback.errors.length === 0) {
          return {
            fieldKey: field.key,
            fieldLabel: field.label,
            required: field.required,
            status: "filled",
            details: "Filled the field after AI corrected the value using site feedback.",
          };
        }

        return {
          fieldKey: field.key,
          fieldLabel: field.label,
          required: field.required,
          status: "failed",
          details: correctedFeedback.errors[0]!,
        };
      }

      return {
        fieldKey: field.key,
        fieldLabel: field.label,
        required: field.required,
        status: "failed",
        details: siteFeedback.errors[0]!,
      };
    }

    return {
      fieldKey: field.key,
      fieldLabel: field.label,
      required: field.required,
      status: "filled",
      details: "Filled the field.",
    };
  } catch (error) {
    return {
      fieldKey: field.key,
      fieldLabel: field.label,
      required: field.required,
      status: "failed",
      details: error instanceof Error ? error.message : String(error),
    };
  }
}

async function fillSingleFieldWithDiagnostics(
  page: Page,
  field: ExternalApplicationField,
  plan: ExternalApplicationPlannedAnswer | undefined,
  candidateProfile: CandidateProfile,
  pageContext?: {
    title?: string | null;
    text?: string | null;
    sourceUrl?: string | null;
  },
): Promise<{
  result: ExternalFieldFillResult;
  aiCorrectionAttempt?: ExternalAiCorrectionAttempt;
}> {
  const answer = normalizeAnswerValue(plan?.answer ?? null);
  const result = await fillSingleField(page, field, plan, candidateProfile, pageContext);
  if (!answer) {
    return { result };
  }

  const validationFeedback = result.status === "failed" ? result.details : null;
  if (!validationFeedback) {
    return {
      result,
      ...(result.details.includes("AI corrected")
        ? {
            aiCorrectionAttempt: {
              fieldKey: field.key,
              fieldLabel: field.label,
              validationFeedback: "Site feedback triggered a correction retry.",
              previousAnswer: answer,
              correctedAnswer: null,
              outcome: "retry_succeeded" as const,
            },
          }
        : {}),
    };
  }

  const corrected = await repairAnswerFromSiteFeedback({
    question: plan?.question ?? {
      label: field.label,
      inputType: field.type,
      ...(field.options.length > 0 ? { options: field.options } : {}),
      ...(field.helpText ? { helpText: field.helpText } : {}),
      ...(field.placeholder ? { placeholder: field.placeholder } : {}),
    },
    candidateProfile,
    previousAnswer: {
      questionType: "general_short_text",
      strategy: "generated",
      answer,
      confidence: 0.5,
      confidenceLabel: "medium",
      source: plan?.source === "candidate-profile" ? "candidate-profile" : "llm",
    },
    validationFeedback,
    ...(pageContext ? { pageContext } : {}),
  }).catch(() => null);

  if (!corrected) {
    return {
      result,
      aiCorrectionAttempt: {
        fieldKey: field.key,
        fieldLabel: field.label,
        validationFeedback,
        previousAnswer: answer,
        correctedAnswer: null,
        outcome: "repair_failed",
      },
    };
  }

  const correctedAnswer =
    typeof corrected.answer === "string"
      ? corrected.answer.trim()
      : corrected.answer == null
        ? null
        : String(corrected.answer).trim();

  if (!correctedAnswer || correctedAnswer === answer.trim()) {
    return {
      result,
      aiCorrectionAttempt: {
        fieldKey: field.key,
        fieldLabel: field.label,
        validationFeedback,
        previousAnswer: answer,
        correctedAnswer,
        outcome: "same_answer",
        finalFeedback: validationFeedback,
      },
    };
  }

  return {
    result,
    aiCorrectionAttempt: {
      fieldKey: field.key,
      fieldLabel: field.label,
      validationFeedback,
      previousAnswer: answer,
      correctedAnswer,
      outcome: result.details.includes("AI corrected") ? "retry_succeeded" : "retry_failed",
      ...(result.details.includes("AI corrected") ? {} : { finalFeedback: result.details }),
    },
  };
}

// Pulls visible validation and notice messages from an external application page.
export async function collectExternalSiteFeedback(page: Page): Promise<SiteFeedbackSnapshot> {
  if (typeof (page as Page & { evaluate?: unknown }).evaluate !== "function") {
    return createEmptySiteFeedbackSnapshot();
  }

  const messages = await page.evaluate(() => {
    const normalize = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
    const nodes = Array.from(
      (globalThis as { document?: { querySelectorAll?: (selector: string) => Iterable<unknown> } }).document?.querySelectorAll?.([
        "[role='alert']",
        "[aria-live='assertive']",
        "[aria-live='polite']",
        ".error",
        ".errors",
        ".field-error",
        ".invalid-feedback",
        ".warning",
        ".notice",
        ".success",
        ".artdeco-inline-feedback",
        ".artdeco-inline-feedback__message",
      ].join(", ")) ?? [],
    );
    const results: Array<{ severity: "error" | "warning" | "info"; message: string; source: string }> = [];
    const seen = new Set<string>();
    for (const node of nodes) {
      const element = node as {
        textContent?: string | null;
        getAttribute?: (name: string) => string | null;
      };
      const message = normalize(element.textContent);
      if (!message || seen.has(message)) {
        continue;
      }
      seen.add(message);
      const className = normalize(element.getAttribute?.("class")).toLowerCase();
      const ariaLive = normalize(element.getAttribute?.("aria-live")).toLowerCase();
      const severity =
        className.includes("error") || className.includes("invalid") || ariaLive === "assertive"
          ? "error"
          : className.includes("warning")
            ? "warning"
            : "info";
      results.push({
        severity,
        message,
        source: "external.apply",
      });
    }
    return results;
  }).catch(() => []);

  return {
    ...createEmptySiteFeedbackSnapshot(),
    messages,
    errors: messages.filter((message) => message.severity === "error").map((message) => message.message),
    warnings: messages.filter((message) => message.severity === "warning").map((message) => message.message),
    infos: messages.filter((message) => message.severity === "info").map((message) => message.message),
  };
}

export async function getExternalPrimaryAction(page: Page): Promise<ExternalPrimaryAction> {
  const nextSelectors = [
    `button:has-text("Next")`,
    `button:has-text("Continue")`,
    `input[type="submit"][value="Next"]`,
    `input[type="submit"][value="Continue"]`,
  ];
  const submitSelectors = [
    `button:has-text("Submit")`,
    `button:has-text("Submit application")`,
    `input[type="submit"][value="Submit"]`,
  ];

  if (await findFirstLocator(page, nextSelectors)) {
    return "next";
  }
  if (await findFirstLocator(page, submitSelectors)) {
    return "submit";
  }

  return "unknown";
}

export async function advanceExternalApplicationPage(
  page: Page,
  action: Extract<ExternalPrimaryAction, "next" | "submit">,
): Promise<boolean> {
  const selectors = action === "next"
    ? [`button:has-text("Next")`, `button:has-text("Continue")`, `input[type="submit"][value="Next"]`]
    : [`button:has-text("Submit")`, `button:has-text("Submit application")`, `input[type="submit"][value="Submit"]`];
  const locator = await findFirstLocator(page, selectors);
  if (!locator) {
    return false;
  }

  await locator.click();
  await page.waitForTimeout(750);
  return true;
}

export async function fillExternalApplicationPage(args: {
  page: Page;
  discovery: ExternalApplicationDiscovery;
  answerPlan: ExternalApplicationPlannedAnswer[];
  candidateProfile: CandidateProfile;
  submit?: boolean;
}): Promise<ExternalFillResult> {
  // Captures page text once so AI correction retries can reuse the same page context consistently.
  const fieldResults: ExternalFieldFillResult[] = [];
  const aiCorrectionAttempts: ExternalAiCorrectionAttempt[] = [];
  const pageText = await args.page.evaluate(() =>
    String((globalThis as { document?: { body?: { innerText?: string } } }).document?.body?.innerText ?? "")
      .replace(/\s+/g, " ")
      .trim(),
  ).catch(() => "");

  for (const field of args.discovery.fields) {
    const plan = args.answerPlan.find((candidate) => candidate.fieldKey === field.key);
    const filled = await fillSingleFieldWithDiagnostics(args.page, field, plan, args.candidateProfile, {
      title: args.discovery.pageTitle,
      text: pageText,
      sourceUrl: args.discovery.finalUrl,
    });
    fieldResults.push(filled.result);
    if (filled.aiCorrectionAttempt) {
      aiCorrectionAttempts.push(filled.aiCorrectionAttempt);
    }
  }

  const blockingRequiredFields = fieldResults
    .filter((result) => result.required && result.status !== "filled")
    .map((result) => result.fieldLabel);
  const primaryAction = await getExternalPrimaryAction(args.page);
  const preAdvanceFeedback = await collectExternalSiteFeedback(args.page);
  let advanced = false;

  if (blockingRequiredFields.length === 0 && primaryAction === "next") {
    advanced = await advanceExternalApplicationPage(args.page, "next");
  } else if (args.submit === true && blockingRequiredFields.length === 0 && primaryAction === "submit") {
    advanced = await advanceExternalApplicationPage(args.page, "submit");
  }

  const postAdvanceFeedback = advanced
    ? await collectExternalSiteFeedback(args.page)
    : createEmptySiteFeedbackSnapshot();

  return {
    fieldResults,
    primaryAction,
    advanced,
    blockingRequiredFields,
    siteFeedback: mergeSiteFeedbackSnapshots(preAdvanceFeedback, postAdvanceFeedback),
    aiCorrectionAttempts,
  };
}
