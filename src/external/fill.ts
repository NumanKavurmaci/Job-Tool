import { existsSync } from "node:fs";
import type { Page } from "@playwright/test";
import type {
  ExternalApplicationDiscovery,
  ExternalApplicationField,
  ExternalApplicationPlannedAnswer,
} from "./types.js";

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

async function fillSingleField(
  page: Page,
  field: ExternalApplicationField,
  plan: ExternalApplicationPlannedAnswer | undefined,
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
}): Promise<ExternalFillResult> {
  const fieldResults: ExternalFieldFillResult[] = [];

  for (const field of args.discovery.fields) {
    const plan = args.answerPlan.find((candidate) => candidate.fieldKey === field.key);
    fieldResults.push(await fillSingleField(args.page, field, plan));
  }

  const blockingRequiredFields = fieldResults
    .filter((result) => result.required && result.status !== "filled")
    .map((result) => result.fieldLabel);
  const primaryAction = await getExternalPrimaryAction(args.page);
  let advanced = false;

  if (blockingRequiredFields.length === 0 && primaryAction === "next") {
    advanced = await advanceExternalApplicationPage(args.page, "next");
  }

  return {
    fieldResults,
    primaryAction,
    advanced,
    blockingRequiredFields,
  };
}
