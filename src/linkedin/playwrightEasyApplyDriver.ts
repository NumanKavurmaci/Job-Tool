import type { Page } from "@playwright/test";
import { ensureLinkedInAuthenticated } from "../adapters/LinkedInAdapter.js";
import type {
  EasyApplyDriver,
  EasyApplyPrimaryAction,
  EasyApplyQuestionView,
} from "./easyApply.js";
import { chooseRadioValue } from "./easyApply.js";
import type { ResolvedAnswer } from "../answers/types.js";

const EASY_APPLY_TRIGGER_SELECTOR = [
  "button[aria-label*='Easy Apply']",
  "button.jobs-apply-button",
  ".jobs-apply-button",
  "a[aria-label*='Easy Apply']",
  "a[href*='/apply/'][href*='openSDUIApplyFlow=true']",
].join(", ");

async function annotateQuestions(page: Page): Promise<EasyApplyQuestionView[]> {
  const dialog = page.locator(".jobs-easy-apply-modal, [role='dialog']").first();
  const script = `
    const normalizeFieldType = (type) => {
      const normalized = (type ?? "text").toLowerCase();
      return normalized === "select-one" ? "select" : normalized;
    };

    const getLabel = (modal, element) => {
      const id = element.getAttribute("id");
      const byFor = id ? modal.querySelector('label[for="' + id + '"]') : null;
      const wrappingLabel = element.closest("label");
      const fieldset = element.closest("fieldset");
      const legend = fieldset ? fieldset.querySelector("legend") : null;
      const dashForm = element.closest(".fb-dash-form-element");
      const groupLabel = dashForm ? dashForm.querySelector("label") : null;

      return (
        (byFor && byFor.textContent) ||
        (wrappingLabel && wrappingLabel.textContent) ||
        (legend && legend.textContent) ||
        (groupLabel && groupLabel.textContent) ||
        ""
      ).replace(/\\s+/g, " ").trim();
    };

    const results = [];
    let counter = 0;
    const seenRadioGroups = new Set();
    const controls = Array.from(modal.querySelectorAll("input, textarea, select"));

    for (const control of controls) {
      const inputType = control.tagName === "TEXTAREA"
        ? "textarea"
        : control.tagName === "SELECT"
          ? "select"
          : (control.type || "text");

      if (["hidden", "submit", "button"].includes(inputType)) {
        continue;
      }

      if (inputType === "radio") {
        const groupName = control.name || ("radio-" + counter);
        if (seenRadioGroups.has(groupName)) {
          continue;
        }

        seenRadioGroups.add(groupName);
        const radios = control.name
          ? Array.from(modal.querySelectorAll('input[type="radio"][name="' + groupName + '"]'))
          : [control];
        const fieldKey = "radio-" + counter++;
        const options = radios.map((radio, index) => {
          radio.setAttribute("data-job-tool-field-key", fieldKey);
          const optionLabel = (
            (radio.closest("label") && radio.closest("label").textContent) ||
            (radio.parentElement && radio.parentElement.textContent) ||
            radio.value ||
            ("option-" + (index + 1))
          ).replace(/\\s+/g, " ").trim();
          radio.setAttribute("data-job-tool-option-label", optionLabel);
          return optionLabel;
        });

        results.push({
          fieldKey,
          label: getLabel(modal, radios[0] || control),
          inputType: "radio",
          options,
          required: radios.some((radio) => radio.required || radio.getAttribute("aria-required") === "true"),
        });
        continue;
      }

      const fieldKey = "field-" + counter++;
      control.setAttribute("data-job-tool-field-key", fieldKey);

      const options = control.tagName === "SELECT"
        ? Array.from(control.options).map((option) => option.textContent ? option.textContent.trim() : "").filter(Boolean)
        : undefined;
      const currentValue = control.tagName === "SELECT"
        ? (control.selectedOptions && control.selectedOptions[0] && control.selectedOptions[0].textContent
          ? control.selectedOptions[0].textContent.trim()
          : "")
        : ((control.value || "").trim());
      const expectsDecimal = (control.getAttribute("inputmode") || "").toLowerCase() === "decimal"
        || (control.getAttribute("type") || "").toLowerCase() === "number"
        || (control.getAttribute("step") || "").includes(".");
      const isPrefilled = Boolean(
        currentValue &&
        (!options || !["select an option", "choose an option", "please select"].includes(currentValue.toLowerCase())),
      );

      results.push({
        fieldKey,
        label: getLabel(modal, control),
        helpText: control.getAttribute("aria-describedby"),
        placeholder: control.getAttribute("placeholder"),
        inputType: normalizeFieldType(inputType),
        currentValue: currentValue || null,
        isPrefilled,
        expectsDecimal,
        validationMessage: control.validationMessage || null,
        ...(options && options.length > 0 ? { options } : {}),
        required: control.hasAttribute("required") || control.getAttribute("aria-required") === "true",
      });
    }

    return results;
  `;

  return dialog.evaluate(
    (modal, source) => new Function("modal", source)(modal),
    script,
  );
}

export class PlaywrightLinkedInEasyApplyDriver implements EasyApplyDriver {
  constructor(private readonly page: Page) {}

  async open(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await this.page.waitForTimeout(2_000);
  }

  async openCollection(url: string): Promise<void> {
    await this.open(url);
  }

  async ensureAuthenticated(url: string): Promise<void> {
    await ensureLinkedInAuthenticated(this.page, url);
  }

  async isEasyApplyAvailable(): Promise<boolean> {
    const locator = this.page.locator(EASY_APPLY_TRIGGER_SELECTOR).first();
    return (await locator.count()) > 0;
  }

  async isAlreadyApplied(): Promise<boolean> {
    const badge = this.page.locator(
      [
        "#jobs-apply-see-application-link",
        ".jobs-s-apply__application-link",
        ".artdeco-inline-feedback__message:has-text('Applied')",
      ].join(", "),
    ).first();

    return (await badge.count()) > 0;
  }

  async openEasyApply(): Promise<void> {
    const locator = this.page.locator(EASY_APPLY_TRIGGER_SELECTOR).first();
    await locator.click();
    await this.page.waitForTimeout(1_500);
  }

  async collectQuestions(): Promise<EasyApplyQuestionView[]> {
    return annotateQuestions(this.page);
  }

  async collectVisibleJobs() {
    const cards = await this.page.locator(".jobs-search-results__list-item, li.scaffold-layout__list-item")
      .evaluateAll((elements) =>
        elements.map((element) => {
          const anchor = element.querySelector(
            "a[href*='/jobs/view/'], .job-card-container__link, .job-card-list__title",
          );
          const href = anchor?.getAttribute("href") ?? "";
          const text = (element.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
          return {
            href,
            alreadyApplied: text.includes("applied") || text.includes("see application"),
          };
        }),
      );

    const normalized = new Map<string, { url: string; alreadyApplied: boolean }>();
    for (const card of cards) {
      if (!card.href || !card.href.includes("/jobs/view/")) {
        continue;
      }

      try {
        const url = new URL(card.href, this.page.url());
        const match = url.pathname.match(/\/jobs\/view\/(\d+)/);
        if (!match) {
          continue;
        }

        const normalizedUrl = `${url.origin}/jobs/view/${match[1]}`;
        const existing = normalized.get(normalizedUrl);
        normalized.set(normalizedUrl, {
          url: normalizedUrl,
          alreadyApplied: existing?.alreadyApplied === true || card.alreadyApplied,
        });
      } catch {
        continue;
      }
    }

    return Array.from(normalized.values());
  }

  async goToNextResultsPage(): Promise<boolean> {
    const locator = this.page
      .locator(
        "button[aria-label='View next page'], button.jobs-search-pagination__button--next",
      )
      .first();

    if ((await locator.count()) === 0) {
      return false;
    }

    if (await locator.isDisabled().catch(() => false)) {
      return false;
    }

    await locator.click();
    await this.page.waitForTimeout(2_000);
    return true;
  }

  async fillAnswer(
    question: EasyApplyQuestionView,
    resolved: ResolvedAnswer,
  ): Promise<{ filled: boolean; details?: string }> {
    if (question.inputType === "radio") {
      const optionLabel = chooseRadioValue(question.options ?? [], resolved.answer);
      if (!optionLabel) {
        return { filled: false, details: "Could not match a radio option." };
      }

      const locator = this.page
        .locator(
          `[data-job-tool-field-key="${question.fieldKey}"][data-job-tool-option-label="${optionLabel}"]`,
        )
        .first();
      try {
        await locator.click({ force: true });
      } catch {
        await locator.evaluate((element) => {
          const input = element as {
            checked?: boolean;
            dispatchEvent: (event: Event) => boolean;
          };
          input.checked = true;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        });
      }
      return { filled: true };
    }

    const locator = this.page.locator(`[data-job-tool-field-key="${question.fieldKey}"]`).first();

    if (question.inputType === "select") {
      const optionLabel = chooseRadioValue(question.options ?? [], resolved.answer);
      if (!optionLabel) {
        return { filled: false, details: "Could not match a select option." };
      }

      try {
        await locator.selectOption({ label: optionLabel });
        return { filled: true };
      } catch {
        return { filled: false, details: "Could not select the requested option." };
      }
    }

    if (question.inputType === "checkbox") {
      if (resolved.answer === true) {
        await locator.click();
        return { filled: true };
      }

      return { filled: false, details: "Checkbox left unchanged." };
    }

    const value = typeof resolved.answer === "string"
      ? resolved.answer
      : typeof resolved.answer === "boolean"
        ? resolved.answer
          ? "Yes"
          : "No"
        : Array.isArray(resolved.answer)
          ? resolved.answer.join(", ")
          : "";

    if (!value) {
      return { filled: false, details: "No value available for text input." };
    }

    await locator.fill(value);
    await locator.blur();

    const validationMessage = await locator.evaluate((element) =>
      "validationMessage" in element ? String((element as { validationMessage?: string }).validationMessage || "") : "",
    );
    if (validationMessage) {
      return { filled: false, details: validationMessage };
    }

    return { filled: true };
  }

  async getPrimaryAction(): Promise<EasyApplyPrimaryAction> {
    const submit = this.page
      .locator("[data-live-test-easy-apply-submit-button], button[aria-label*='Submit application']")
      .first();
    if ((await submit.count()) > 0) {
      return "submit";
    }

    const review = this.page
      .locator(
        "[data-live-test-easy-apply-review-button], button[aria-label*='Review your application'], button:has-text('Review')",
      )
      .first();
    if ((await review.count()) > 0) {
      return "review";
    }

    const next = this.page
      .locator(
        "[data-live-test-easy-apply-next-button], [data-easy-apply-next-button], button[aria-label*='Continue to next step'], button:has-text('Next')",
      )
      .first();
    if ((await next.count()) > 0) {
      return "next";
    }

    return "unknown";
  }

  async advance(action: "next" | "review"): Promise<void> {
    const locator = action === "review"
      ? this.page
        .locator(
          "[data-live-test-easy-apply-review-button], button[aria-label*='Review your application'], button:has-text('Review')",
        )
        .first()
      : this.page
        .locator(
          "[data-live-test-easy-apply-next-button], [data-easy-apply-next-button], button[aria-label*='Continue to next step'], button:has-text('Next')",
        )
        .first();
    await locator.click();
    await this.page.waitForTimeout(1_500);
  }

  async dismissCompletionModal(): Promise<boolean> {
    const notNow = this.page.locator(
      [
        "button:has-text('Not now')",
        ".job-seeker-nba--modal-footer button.artdeco-button--secondary",
        "[data-view-name='seeker-next-best-action-card-cta-with-impression']",
      ].join(", "),
    ).filter({ hasText: "Not now" }).first();

    if ((await notNow.count()) === 0) {
      return false;
    }

    await notNow.click();
    await this.page.waitForTimeout(1_000);
    return true;
  }
}
