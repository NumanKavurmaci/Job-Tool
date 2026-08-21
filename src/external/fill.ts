import { existsSync } from "node:fs";
import type { Page } from "@playwright/test";
import type { CandidateProfile } from "../candidate/types.js";
import {
  acceptAllCookiePrompts,
  type CookiePromptAcceptance,
} from "../browser/cookies.js";
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

const EXTERNAL_NEXT_BUTTON_LABELS = [
  "Next",
  "Continue",
  "Continue application",
  "Save and continue",
  "Proceed",
  "Review",
  "Review application",
  "Volgende",
  "Verder",
  "Devam",
  "İleri",
  "Ileri",
  "Sonraki",
  "Başvuruya devam et",
  "Basvuruya devam et",
];

const EXTERNAL_SUBMIT_BUTTON_LABELS = [
  "Submit",
  "Submit application",
  "Apply",
  "Apply now",
  "Send application",
  "Complete application",
  "Solliciteer",
  "Versturen",
  "Başvur",
  "Basvur",
  "Başvuruyu gönder",
  "Basvuruyu gonder",
  "Gönder",
  "Gonder",
  "Başvuruyu tamamla",
  "Basvuruyu tamamla",
];

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
  cookiePromptAcceptances: CookiePromptAcceptance[];
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

function normalizeAnswerValues(answer: string | string[] | null): string[] {
  const values = Array.isArray(answer) ? answer : answer == null ? [] : [answer];
  return values.map((value) => value.trim()).filter(Boolean);
}

function normalizeAnswerValue(answer: string | string[] | null): string {
  return normalizeAnswerValues(answer).join(", ");
}

function normalizeMultiSelectAnswerValues(
  answer: string | string[] | null,
  options: string[],
): string[] {
  const values = Array.isArray(answer)
    ? normalizeAnswerValues(answer)
    : normalizeAnswerValues(answer).flatMap((value) => value.split(/[,;\n]/).map((part) => part.trim()));
  return values
    .filter(Boolean)
    .map((value) =>
      options.find((option) => option.trim().toLocaleLowerCase("tr-TR") === value.toLocaleLowerCase("tr-TR")) ?? value,
    );
}

function normalizeBooleanAnswer(answer: string, options: string[]): {
  shouldCheck: boolean;
  matchedOption?: string | undefined;
} | null {
  const normalized = answer.trim().toLocaleLowerCase("tr-TR");
  if (!normalized) {
    return null;
  }

  const matchedOption = options.find(
    (option) => option.trim().toLowerCase() === normalized,
  );
  if (matchedOption) {
    const option = matchedOption;
    if (/^(yes|true|on|agree|accepted|allow|opt in|evet|kabul ediyorum)$/i.test(matchedOption.trim())) {
      return option
        ? { shouldCheck: true, matchedOption: option }
        : { shouldCheck: true };
    }
    if (/^(no|false|off|decline|disagree|opt out|hayır|hayir|kabul etmiyorum)$/i.test(matchedOption.trim())) {
      return option
        ? { shouldCheck: false, matchedOption: option }
        : { shouldCheck: false };
    }
  }

  if (/^(yes|true|on|agree|accepted|allow|opt in|evet|kabul ediyorum)$/i.test(normalized)) {
    return { shouldCheck: true, matchedOption };
  }
  if (/^(no|false|off|decline|disagree|opt out|hayır|hayir|kabul etmiyorum)$/i.test(normalized)) {
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

  if (
    field.semanticKey === "consent.sms" ||
    /sms|text message|kısa mesaj|kisa mesaj|pazarlama mesaj/i.test(`${field.label} ${field.helpText ?? ""}`)
  ) {
    return false;
  }

  return (
    field.semanticKey === "consent.privacy" ||
    /privacy|privacy policy|terms|gdpr|kvkk|personal data|kişisel veri|kisisel veri|aydınlatma metni|aydinlatma metni/i.test(
      `${field.label} ${field.helpText ?? ""}`,
    ) ||
    /semantic:consent\.privacy/.test(plan?.resolutionStrategy ?? "")
  );
}

function isSelfDescribingSelectable(field: ExternalApplicationField): boolean {
  return (
    field.options.length === 0 &&
    /^i['’]?m\b/i.test(field.label.trim())
  );
}

function isCheckboxControl(field: ExternalApplicationField): boolean {
  return field.htmlInputType?.toLowerCase() === "checkbox";
}

function isRadioControl(field: ExternalApplicationField): boolean {
  return field.htmlInputType?.toLowerCase() === "radio";
}

function isAshbyField(field: ExternalApplicationField): boolean {
  return (field.selectorHints ?? []).some((hint) => hint.includes("ashby-application-form-field-entry"));
}

function isAshbyCountryComboboxField(field: ExternalApplicationField): boolean {
  return isAshbyField(field) && field.semanticKey === "location.country";
}

function getAshbyOptionAliases(answer: string): string[] {
  const normalized = answer.trim();
  if (!normalized) {
    return [];
  }

  const aliases = [normalized];
  if (/^(turkey|turkiye|türkiye)$/i.test(normalized)) {
    aliases.push("T\u00fcrkiye", "Turkiye", "Turkey");
  }

  return [...new Set(aliases)];
}

/* c8 ignore start */
async function getLocatorControlKind(
  locator: Awaited<ReturnType<typeof findFirstLocator>>,
): Promise<{
  tagName: string;
  inputType: string;
  role: string;
} | null> {
  if (!locator) {
    return null;
  }

  if (typeof (locator as { evaluate?: unknown }).evaluate !== "function") {
    return null;
  }

  return (locator as unknown as {
    evaluate: <T>(callback: (element: unknown) => T) => Promise<T>;
  }).evaluate((element) => {
    const control = element as {
      tagName?: string;
      type?: string;
      getAttribute?: (name: string) => string | null;
    };
    return {
      tagName: String(control.tagName ?? "").toLowerCase(),
      inputType: String(control.type ?? "").toLowerCase(),
      role: String(control.getAttribute?.("role") ?? "").toLowerCase(),
    };
  }).catch(() => null);
}

async function checkBooleanLikeControl(
  locator: Awaited<ReturnType<typeof findFirstLocator>>,
  shouldCheck: boolean,
): Promise<boolean> {
  if (!locator) {
    return false;
  }

  const checkable = locator as unknown as {
    check?: () => Promise<void>;
    uncheck?: () => Promise<void>;
    isChecked?: () => Promise<boolean>;
    click: () => Promise<void>;
  };

  if (shouldCheck) {
    if (typeof checkable.check === "function") {
      await checkable.check();
    } else if (typeof checkable.isChecked !== "function" || !(await checkable.isChecked())) {
      await checkable.click();
    }
    return typeof checkable.isChecked === "function" ? await checkable.isChecked() : true;
  }

  if (typeof checkable.uncheck === "function") {
    await checkable.uncheck();
  } else if (typeof checkable.isChecked === "function" && await checkable.isChecked()) {
    await checkable.click();
  }
  return typeof checkable.isChecked === "function" ? !(await checkable.isChecked()) : true;
}

async function selectRadioOptionAndVerify(
  page: Page,
  field: ExternalApplicationField,
  option: string,
): Promise<boolean> {
  const key = escapeAttributeValue(field.key);
  const escapedOption = escapeAttributeValue(option);
  const normalizedOption = escapeAttributeValue(option.toLocaleLowerCase("tr-TR"));
  const selectors = [
    `input[type="radio"][name="${key}"][value="${escapedOption}"]`,
    `input[type="radio"][name="${key}"][value="${normalizedOption}"]`,
    `label:has-text("${escapedOption}") input[type="radio"][name="${key}"]`,
    `label:has-text("${escapedOption}") input[type="radio"]`,
    `input[type="radio"][aria-label="${escapedOption}"]`,
    `[role="radio"][aria-label="${escapedOption}"]`,
  ];
  let radio = await findFirstLocator(page, selectors);
  if (!radio && typeof (page as Page & { getByLabel?: unknown }).getByLabel === "function") {
    radio = (page as Page & {
      getByLabel: (label: string, options?: { exact?: boolean }) => ReturnType<Page["locator"]>;
    }).getByLabel(option, { exact: true }).first();
    if ((await radio.count().catch(() => 0)) === 0) {
      radio = null;
    }
  }
  if (!radio) {
    return false;
  }

  const checkable = radio as unknown as {
    check?: () => Promise<void>;
    click: () => Promise<void>;
    isChecked?: () => Promise<boolean>;
    getAttribute?: (name: string) => Promise<string | null>;
  };
  if (typeof checkable.check === "function") {
    await checkable.check();
  } else {
    await checkable.click();
  }
  if (typeof checkable.isChecked === "function") {
    const checked = await checkable.isChecked().catch(() => null);
    if (checked !== null) {
      return checked;
    }
  }
  const ariaChecked = await checkable.getAttribute?.("aria-checked").catch(() => null);
  return ariaChecked === "true";
}

function isTextFillCompatibleControl(control: {
  tagName: string;
  inputType: string;
  role: string;
} | null): boolean {
  if (!control) {
    return true;
  }
  if (control.tagName === "textarea") {
    return true;
  }
  if (control.tagName === "select") {
    return false;
  }
  if (control.tagName !== "input") {
    return !["checkbox", "radio", "button", "option"].includes(control.role);
  }

  return ![
    "checkbox",
    "radio",
    "file",
    "button",
    "submit",
    "reset",
    "image",
  ].includes(control.inputType);
}
/* c8 ignore stop */

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

async function clickVisibleOption(
  page: Page,
  answer: string,
  field?: ExternalApplicationField,
): Promise<boolean> {
  const scopedSelectors = field?.label
    ? [
        `.ashby-application-form-field-entry:has(.ashby-application-form-question-title:has-text("${escapeAttributeValue(field.label)}")) label:has-text("${escapeAttributeValue(answer)}")`,
        `.ashby-application-form-field-entry:has(.ashby-application-form-question-title:has-text("${escapeAttributeValue(field.label)}")) [role="option"]:has-text("${escapeAttributeValue(answer)}")`,
        `.ashby-application-form-field-entry:has(.ashby-application-form-question-title:has-text("${escapeAttributeValue(field.label)}")) [class*="option"]:has-text("${escapeAttributeValue(answer)}")`,
      ]
    : [];
  const optionSelectors = [
    ...scopedSelectors,
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

/* c8 ignore start -- browser-context DOM option matching is exercised through Playwright checks */
async function clickVisibleOptionByNormalizedText(page: Page, answers: string[]): Promise<boolean> {
  if (typeof (page as Page & { evaluate?: unknown }).evaluate !== "function") {
    return false;
  }

  return (page as Page & {
    evaluate: <T>(callback: (input: { answers: string[] }) => T, input: { answers: string[] }) => Promise<T>;
  }).evaluate(({ answers: optionAnswers }) => {
    const normalize = (value: unknown) =>
      String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    const expected = new Set(optionAnswers.map(normalize).filter(Boolean));
    const candidates = Array.from(
      (globalThis as {
        document?: { querySelectorAll?: (selector: string) => Iterable<unknown> };
      }).document?.querySelectorAll?.("[role='option'], [class*='result'], [class*='option'], li") ?? [],
    );
    for (const candidate of candidates) {
      const element = candidate as { textContent?: string | null; click?: () => void };
      const text = normalize(element.textContent);
      if (!text || !expected.has(text)) {
        continue;
      }
      element.click?.();
      return true;
    }

    return false;
  }, { answers }).catch(() => false);
}
/* c8 ignore stop */

async function selectAshbyComboboxOption(
  page: Page,
  field: ExternalApplicationField,
  answer: string,
): Promise<boolean> {
  const key = escapeAttributeValue(field.key);
  const label = escapeAttributeValue(field.label);
  const scopedEntries = [
    `.ashby-application-form-field-entry[data-field-path="${key}"]`,
    `.ashby-application-form-field-entry:has(.ashby-application-form-question-title:has-text("${label}"))`,
  ];
  const combobox = await findFirstLocator(
    page,
    scopedEntries.flatMap((entry) => [
      `${entry} input[role="combobox"]`,
      `${entry} input[aria-autocomplete="list"]`,
      `${entry} [role="combobox"]`,
    ]),
  );
  if (!combobox) {
    return false;
  }

  const aliases = getAshbyOptionAliases(answer);
  for (const alias of aliases) {
    await combobox.click().catch(() => undefined);
    await combobox.fill(alias);
    await page.waitForTimeout(900);

    const clickedNormalizedOption = await clickVisibleOptionByNormalizedText(page, aliases);
    if (clickedNormalizedOption === true) {
      return true;
    }

    for (const optionAlias of aliases) {
      const clickedOption = await clickVisibleOption(page, optionAlias, field).catch(() => false);
      if (clickedOption) {
        return true;
      }
    }
  }

  return false;
}

async function selectNativeOption(
  locator: Awaited<ReturnType<typeof findFirstLocator>>,
  answer: string | string[],
): Promise<boolean> {
  if (!locator || typeof (locator as { selectOption?: unknown }).selectOption !== "function") {
    return false;
  }

  const answers = Array.isArray(answer) ? answer : [answer];
  const attempts: unknown[] = answers.length > 1
    ? [answers.map((value) => ({ label: value })), answers.map((value) => ({ value })), answers]
    : [{ label: answers[0] }, { value: answers[0] }, answers[0]];

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
  const answerValues = field.type === "multi_select"
    ? normalizeMultiSelectAnswerValues(plan?.answer ?? null, field.options)
    : normalizeAnswerValues(plan?.answer ?? null);
  const answer = answerValues.join(", ");
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

      if (isRadioControl(field) && booleanAnswer.matchedOption) {
        const selected = await selectRadioOptionAndVerify(
          page,
          field,
          booleanAnswer.matchedOption,
        ).catch(() => false);
        await locator.blur().catch(() => undefined);
        return {
          fieldKey: field.key,
          fieldLabel: field.label,
          required: field.required,
          status: selected ? "filled" : "failed",
          details: selected
            ? `Selected and verified the ${booleanAnswer.matchedOption} radio option.`
            : `Could not select and verify the ${booleanAnswer.matchedOption} radio option.`,
        };
      }

      if (booleanAnswer.shouldCheck) {
        const clickedOption = await clickVisibleOption(
          page,
          booleanAnswer.matchedOption ?? answer,
          field,
        ).catch(() => false);

        if (!clickedOption) {
          await checkBooleanLikeControl(locator, true);
        }
      } else if (isCheckboxControl(field) || isRadioControl(field)) {
        await checkBooleanLikeControl(locator, false);
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
      const controlKind = await getLocatorControlKind(locator);
      /* c8 ignore start */
      if (isCheckboxControl(field) || controlKind?.inputType === "checkbox") {
        const booleanAnswer =
          normalizeBooleanAnswer(answer, field.options) ??
          (shouldAutoAcceptConsent(field, plan)
            ? { shouldCheck: true, matchedOption: field.options[0] }
            : null);
        if (!booleanAnswer) {
          return {
            fieldKey: field.key,
            fieldLabel: field.label,
            required: field.required,
            status: "skipped",
            details: "No compatible checkbox answer was available for this field.",
          };
        }

        const selected = await checkBooleanLikeControl(locator, booleanAnswer.shouldCheck);
        return {
          fieldKey: field.key,
          fieldLabel: field.label,
          required: field.required,
          status: selected ? "filled" : "failed",
          details: selected
            ? booleanAnswer.shouldCheck
              ? "Selected the checkbox field."
              : "Left the checkbox field unselected."
            : "Could not set the checkbox field to the requested state.",
        };
      }

      if (isRadioControl(field) || controlKind?.inputType === "radio") {
        const selectedOption = await selectRadioOptionAndVerify(page, field, answer).catch(() => false);
        if (!selectedOption) {
          return {
            fieldKey: field.key,
            fieldLabel: field.label,
            required: field.required,
            status: "failed",
            details: "Could not select a matching radio option.",
          };
        }
        return {
          fieldKey: field.key,
          fieldLabel: field.label,
          required: field.required,
          status: "filled",
          details: "Selected a radio option.",
        };
      }
      /* c8 ignore stop */

      if (isAshbyCountryComboboxField(field)) {
        const selectedAshbyOption = await selectAshbyComboboxOption(page, field, answer).catch(() => false);
        await locator.blur().catch(() => undefined);
        return {
          fieldKey: field.key,
          fieldLabel: field.label,
          required: field.required,
          status: selectedAshbyOption ? "filled" : "failed",
          details: selectedAshbyOption
            ? "Selected an Ashby country option from the combobox."
            : "Could not select a matching Ashby country option from the combobox.",
        };
      }

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
      const selectedNativeOption = await selectNativeOption(
        locator,
        field.type === "multi_select" ? answerValues : answer,
      ).catch(() => false);
      const clickedOption = selectedNativeOption
        ? false
        : await clickVisibleOption(page, answer, field).catch(() => false);
      const clickedLabelControl =
        selectedNativeOption || clickedOption || !isSelfDescribingSelectable(field)
          ? false
          : !/^(yes|true|on|agree)$/i.test(answer.trim())
          ? false
          : await locator.click().then(() => true).catch(() => false);

      if (!selectedNativeOption && !clickedOption && !clickedLabelControl) {
        if (!isTextFillCompatibleControl(controlKind)) {
          return {
            fieldKey: field.key,
            fieldLabel: field.label,
            required: field.required,
            status: "failed",
            details: `Cannot fill a non-text form control (${controlKind?.tagName || "unknown"}${controlKind?.inputType ? `:${controlKind.inputType}` : ""}).`,
          };
        }
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
          ? field.type === "multi_select" && answerValues.length > 1
            ? "Selected multiple native options."
            : "Selected a native option."
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
        : await clickVisibleOption(page, fillValue, field).catch(() => false);
      if (!selectedCityOption) {
        await locator.press("ArrowDown").catch(() => undefined);
        await locator.press("Enter").catch(() => undefined);
      }
    } else {
      const controlKind = await getLocatorControlKind(locator);
      if (!isTextFillCompatibleControl(controlKind)) {
        return {
          fieldKey: field.key,
          fieldLabel: field.label,
          required: field.required,
          status: "failed",
          details: `Cannot fill a non-text form control (${controlKind?.tagName || "unknown"}${controlKind?.inputType ? `:${controlKind.inputType}` : ""}).`,
        };
      }
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
  const nextSelectors = EXTERNAL_NEXT_BUTTON_LABELS.flatMap((label) => [
    `button:has-text("${escapeAttributeValue(label)}")`,
    `input[type="submit"][value="${escapeAttributeValue(label)}"]`,
    `input[type="button"][value="${escapeAttributeValue(label)}"]`,
    `[role="button"]:has-text("${escapeAttributeValue(label)}")`,
  ]);
  const submitSelectors = EXTERNAL_SUBMIT_BUTTON_LABELS.flatMap((label) => [
    `button:has-text("${escapeAttributeValue(label)}")`,
    `input[type="submit"][value="${escapeAttributeValue(label)}"]`,
    `input[type="button"][value="${escapeAttributeValue(label)}"]`,
    `[role="button"]:has-text("${escapeAttributeValue(label)}")`,
  ]);

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
  const labels = action === "next" ? EXTERNAL_NEXT_BUTTON_LABELS : EXTERNAL_SUBMIT_BUTTON_LABELS;
  const selectors = labels.flatMap((label) => [
    `button:has-text("${escapeAttributeValue(label)}")`,
    `input[type="submit"][value="${escapeAttributeValue(label)}"]`,
    `input[type="button"][value="${escapeAttributeValue(label)}"]`,
    `[role="button"]:has-text("${escapeAttributeValue(label)}")`,
  ]);
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
  const cookiePromptAcceptances = await acceptAllCookiePrompts(args.page).catch(() => []);
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
    cookiePromptAcceptances,
  };
}
