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

  for (const selectorHint of field.selectorHints ?? []) {
    pushUnique(selectors, selectorHint);
  }
  pushUnique(selectors, `[id="${escapeAttributeValue(field.key)}"]`);
  pushUnique(selectors, `[name="${escapeAttributeValue(field.key)}"]`);

  if (field.label) {
    pushUnique(selectors, `input[aria-label="${escapeAttributeValue(field.label)}"]`);
    pushUnique(selectors, `textarea[aria-label="${escapeAttributeValue(field.label)}"]`);
    pushUnique(selectors, `select[aria-label="${escapeAttributeValue(field.label)}"]`);
    pushUnique(selectors, `label:has-text("${escapeAttributeValue(field.label)}")`);
    pushUnique(selectors, `button:has-text("${escapeAttributeValue(field.label)}")`);
    pushUnique(selectors, `[role="button"]:has-text("${escapeAttributeValue(field.label)}")`);
    pushUnique(selectors, `[role="radio"]:has-text("${escapeAttributeValue(field.label)}")`);
    pushUnique(selectors, `[role="checkbox"]:has-text("${escapeAttributeValue(field.label)}")`);
    pushUnique(selectors, `[data-testid="${escapeAttributeValue(field.label)}"]`);
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
    pushUnique(selectors, `.file-input-container .button.resume`);
    pushUnique(selectors, `a.button.resume`);
    pushUnique(selectors, `button.button.resume`);
    pushUnique(selectors, `[ng-click*="showFileSelector"]`);
    if (/upload resume/i.test(field.label)) {
      pushUnique(selectors, `a:has-text("Upload Resume")`);
      pushUnique(selectors, `button:has-text("Upload Resume")`);
    }
  }

  return selectors;
}

async function findFirstLocator(page: Page, selectors: string[]) {
  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).first();
      if ((await locator.count()) > 0) {
        return locator;
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function uploadFileViaChooser(
  page: Page,
  locator: Awaited<ReturnType<typeof findFirstLocator>>,
  filePath: string,
): Promise<boolean> {
  if (!locator || typeof (page as Page & { waitForEvent?: unknown }).waitForEvent !== "function") {
    return false;
  }

  try {
    const fileChooserPromise = (page as Page & {
      waitForEvent: (event: string) => Promise<{ setFiles: (files: string) => Promise<void> }>;
    }).waitForEvent("filechooser");
    await locator.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizeAnswerValue(answer: string | null): string {
  return answer?.trim() ?? "";
}

function normalizeBooleanAnswer(answer: string, options: string[]): {
  shouldCheck: boolean;
  matchedOption?: string | undefined;
} | null {
  const normalized = answer.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const matchedOption = options.find(
    (option) => option.trim().toLowerCase() === normalized,
  );
  if (matchedOption) {
    const option = matchedOption;
    if (/^(yes|true|on|agree|accepted|allow|opt in)$/i.test(matchedOption.trim())) {
      return option
        ? { shouldCheck: true, matchedOption: option }
        : { shouldCheck: true };
    }
    if (/^(no|false|off|decline|disagree|opt out)$/i.test(matchedOption.trim())) {
      return option
        ? { shouldCheck: false, matchedOption: option }
        : { shouldCheck: false };
    }
  }

  if (/^(yes|true|on|agree|accepted|allow|opt in)$/i.test(normalized)) {
    return { shouldCheck: true, matchedOption };
  }
  if (/^(no|false|off|decline|disagree|opt out)$/i.test(normalized)) {
    return { shouldCheck: false, matchedOption };
  }

  return null;
}

function shouldAutoAcceptConsent(
  field: ExternalApplicationField,
  plan: ExternalApplicationPlannedAnswer | undefined,
): boolean {
  if (!field.required) {
    return false;
  }

  return (
    field.semanticKey === "consent.privacy" ||
    field.semanticKey === "consent.sms" ||
    /consent|privacy|policy|terms|gdpr|kvkk/i.test(field.label) ||
    /semantic:consent\./.test(plan?.resolutionStrategy ?? "")
  );
}

function isSelfDescribingSelectable(field: ExternalApplicationField): boolean {
  return (
    field.options.length === 0 &&
    /^i['’]?m\b/i.test(field.label.trim())
  );
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
    `.places-autocomplete_optionsContainer__0VVTk:has-text("${escapeAttributeValue(answer)}")`,
    `[class*="autocomplete"]:has-text("${escapeAttributeValue(answer)}")`,
    `[class*="option"]:has-text("${escapeAttributeValue(answer)}")`,
    `li:has-text("${escapeAttributeValue(answer)}")`,
  ];

  const locator = await findFirstLocator(page, optionSelectors);
  if (!locator) {
    return false;
  }

  await locator.click();
  return true;
}

async function selectNativeOption(
  locator: Awaited<ReturnType<typeof findFirstLocator>>,
  answer: string,
): Promise<boolean> {
  if (!locator || typeof (locator as { selectOption?: unknown }).selectOption !== "function") {
    return false;
  }

  const attempts: Array<string | { label: string } | { value: string }> = [
    { label: answer },
    { value: answer },
    answer,
  ];

  for (const attempt of attempts) {
    try {
      await (
        locator as unknown as {
          selectOption: (value: unknown) => Promise<unknown>;
        }
      ).selectOption(attempt);
      return true;
    } catch {
      continue;
    }
  }

  return false;
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

      try {
        await locator.setInputFiles(answer);
      } catch {
        const uploaded = await uploadFileViaChooser(page, locator, answer);
        if (!uploaded) {
          throw new Error("Could not upload the file using either a file input or file chooser.");
        }
      }
      return {
        fieldKey: field.key,
        fieldLabel: field.label,
        required: field.required,
        status: "filled",
        details: "Selected file for upload.",
      };
    }

    const fillValue = field.type === "url" ? normalizeUrlAnswer(answer) : answer;

    if (field.type === "boolean") {
      const booleanAnswer =
        normalizeBooleanAnswer(answer, field.options) ??
        (shouldAutoAcceptConsent(field, plan)
          ? {
              shouldCheck: true,
              ...(field.options[0] ? { matchedOption: field.options[0] } : {}),
            }
          : null);
      if (!booleanAnswer) {
        return {
          fieldKey: field.key,
          fieldLabel: field.label,
          required: field.required,
          status: "skipped",
          details: "No compatible boolean answer was available for this field.",
        };
      }

      if (booleanAnswer.shouldCheck) {
        const clickedOption = await clickVisibleOption(
          page,
          booleanAnswer.matchedOption ?? answer,
        ).catch(() => false);

        if (!clickedOption) {
          await locator.click();
        }
      }

      await locator.blur().catch(() => undefined);

      return {
        fieldKey: field.key,
        fieldLabel: field.label,
        required: field.required,
        status: "filled",
        details: booleanAnswer.shouldCheck
          ? "Selected the boolean field."
          : "Left the boolean field unselected.",
      };
    }

    if (field.type === "single_select" || field.type === "multi_select") {
      if (isSelfDescribingSelectable(field)) {
        const booleanLike = normalizeBooleanAnswer(answer, ["Yes", "No"]);
        if (booleanLike?.shouldCheck === false) {
          return {
            fieldKey: field.key,
            fieldLabel: field.label,
            required: field.required,
            status: "filled",
            details: "Left the labeled control unselected.",
          };
        }
      }

      const looksLikeReactSelect =
        field.key.startsWith("react-select-") ||
        (field.selectorHints ?? []).some((hint) => hint.includes("react-select-"));
      await locator.click().catch(() => undefined);
      await page.waitForTimeout(900);
      const selectedNativeOption = await selectNativeOption(locator, answer).catch(() => false);
      const clickedOption = selectedNativeOption
        ? false
        : await clickVisibleOption(page, answer).catch(() => false);
      const clickedLabelControl =
        selectedNativeOption || clickedOption || !isSelfDescribingSelectable(field)
          ? false
          : !/^(yes|true|on|agree)$/i.test(answer.trim())
          ? false
          : await locator.click().then(() => true).catch(() => false);

      if (!selectedNativeOption && !clickedOption && !clickedLabelControl) {
        await locator.fill(answer);
        if (looksLikeReactSelect) {
          await page.waitForTimeout(150);
          await locator.press("ArrowDown").catch(() => undefined);
        }
        await locator.press("Enter").catch(() => undefined);
      }

      await locator.blur().catch(() => undefined);

      return {
        fieldKey: field.key,
        fieldLabel: field.label,
        required: field.required,
        status: "filled",
        details: selectedNativeOption
          ? "Selected a native option."
          : clickedOption
          ? "Selected a visible option."
          : clickedLabelControl
          ? "Selected a labeled control."
          : "Filled a selectable field.",
      };
    }

    if (field.semanticKey === "location.city") {
      if (typeof (locator as { pressSequentially?: unknown }).pressSequentially === "function") {
        await (
          locator as unknown as {
            pressSequentially: (value: string, options?: { delay?: number }) => Promise<void>;
          }
        ).pressSequentially(fillValue, { delay: 35 });
      } else {
        await locator.fill(fillValue);
      }
      await page.waitForTimeout(150);
      const selectedAutocompleteContainer = await findFirstLocator(page, [
        `.places-autocomplete_optionsContainer__0VVTk`,
        `[class*="autocomplete_optionsContainer"]`,
        `[class*="places-autocomplete"]`,
      ]);
      const selectedCityOption = selectedAutocompleteContainer
        ? await selectedAutocompleteContainer.click().then(() => true).catch(() => false)
        : await clickVisibleOption(page, fillValue).catch(() => false);
      if (!selectedCityOption) {
        await locator.press("ArrowDown").catch(() => undefined);
        await locator.press("Enter").catch(() => undefined);
      }
    } else {
      await locator.fill(fillValue);
    }
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
    const getElementLabel = (element: {
      id?: string;
      name?: string;
      placeholder?: string | null;
      labels?: ArrayLike<{ textContent?: string | null }> | null;
      getAttribute?: (name: string) => string | null;
    }) => {
      const ariaLabel = normalize(element.getAttribute?.("aria-label"));
      if (ariaLabel) {
        return ariaLabel;
      }

      const labelledBy = normalize(element.getAttribute?.("aria-labelledby"));
      if (labelledBy && (globalThis as { document?: { getElementById?: (id: string) => { textContent?: string | null } | null } }).document?.getElementById) {
        const labelledText = labelledBy
          .split(/\s+/)
          .map((id) =>
            normalize(
              (globalThis as { document?: { getElementById?: (id: string) => { textContent?: string | null } | null } }).document?.getElementById?.(id)?.textContent,
            ),
          )
          .filter(Boolean)
          .join(" ");
        if (labelledText) {
          return labelledText;
        }
      }

      const explicitLabels = Array.from(element.labels ?? [])
        .map((label) => normalize(label.textContent))
        .filter(Boolean)
        .join(" ");
      if (explicitLabels) {
        return explicitLabels;
      }

      const placeholder = normalize(element.placeholder);
      if (placeholder) {
        return placeholder;
      }

      return normalize(element.name) || normalize(element.id) || "Field";
    };
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

    const formControls = Array.from(
      (globalThis as { document?: { querySelectorAll?: (selector: string) => Iterable<unknown> } }).document?.querySelectorAll?.(
        "input, textarea, select",
      ) ?? [],
    );
    for (const control of formControls) {
      const element = control as {
        validationMessage?: string | null;
        checkValidity?: () => boolean;
        matches?: (selector: string) => boolean;
        disabled?: boolean;
        type?: string | null;
        value?: string | null;
        id?: string;
        name?: string;
        placeholder?: string | null;
        labels?: ArrayLike<{ textContent?: string | null }> | null;
        getAttribute?: (name: string) => string | null;
      };
      if (element.disabled) {
        continue;
      }

      const isInvalid =
        (typeof element.checkValidity === "function" && element.checkValidity() === false) ||
        (typeof element.matches === "function" && element.matches(":invalid"));
      if (!isInvalid) {
        continue;
      }

      const validationMessage = normalize(element.validationMessage);
      if (!validationMessage) {
        continue;
      }

      const label = getElementLabel(element);
      const message = label ? `${label}: ${validationMessage}` : validationMessage;
      if (seen.has(message)) {
        continue;
      }
      seen.add(message);
      results.push({
        severity: "error",
        message,
        source: "external.validation",
      });
    }

    const bodyText = normalize(
      (globalThis as { document?: { body?: { innerText?: string | null } } }).document?.body?.innerText,
    );
    const heuristicMessages = [
      {
        pattern: /that looks like an annual rate\.\s*we are asking for a monthly rate, please\.?/i,
        severity: "warning" as const,
      },
      {
        pattern: /please,\s*do not use decimals\.?/i,
        severity: "warning" as const,
      },
      {
        pattern: /please fill out the following information\.?/i,
        severity: "error" as const,
      },
      {
        pattern: /please enter a valid option\.?/i,
        severity: "error" as const,
      },
      {
        pattern: /please complete all (?:required fields and )?consent checkboxes(?: to continue)?\.?/i,
        severity: "error" as const,
      },
      {
        pattern: /please complete all required fields(?: and consent checkboxes to continue)?\.?/i,
        severity: "error" as const,
      },
    ];
    for (const heuristic of heuristicMessages) {
      const match = bodyText.match(heuristic.pattern);
      const message = normalize(match?.[0]);
      if (!message || seen.has(message)) {
        continue;
      }
      seen.add(message);
      results.push({
        severity: heuristic.severity,
        message,
        source: "external.heuristic",
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

// Detects whether the current step is asking the bot to continue or to submit.
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

// Clicks the current primary action and waits briefly for the page to settle.
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

// Fills one external application step, captures feedback, and decides whether the flow can advance.
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
