import type { Locator, Page } from "@playwright/test";
import { ensureLinkedInAuthenticated } from "../adapters/LinkedInAdapter.js";
import type {
  EasyApplyDriver,
  EasyApplyExternalDetection,
  EasyApplyPrimaryAction,
  EasyApplyReviewDiagnostics,
  EasyApplyStepStateSnapshot,
  EasyApplyQuestionView,
} from "./easyApply.js";
import { chooseRadioValue } from "./easyApply.js";
import type { ResolvedAnswer } from "../answers/types.js";
import { createEmptySiteFeedbackSnapshot, type SiteFeedbackSnapshot } from "../browser/siteFeedback.js";

const EASY_APPLY_TRIGGER_SELECTOR = [
  "button[aria-label*='Easy Apply']",
  "button.jobs-apply-button",
  ".jobs-apply-button",
  "a[aria-label*='Easy Apply']",
  "a[href*='/apply/'][href*='openSDUIApplyFlow=true']",
].join(", ");
const EXTERNAL_APPLY_TRIGGER_SELECTOR = [
  "button[aria-label*='Apply to'][aria-label*='company website']",
  "button[aria-label^='Apply to ']:has(svg use[href='#link-external-small'])",
  "button#jobs-apply-button-id[role='link']",
  "button.jobs-apply-button[aria-label*='company website']",
  "a[aria-label*='company website']",
].join(", ");
const EXTERNAL_RESPONSES_MANAGED_OFF_LINKEDIN_SELECTOR = [
  "p:has-text('Responses managed off LinkedIn')",
  "span:has-text('Responses managed off LinkedIn')",
  "div:has-text('Responses managed off LinkedIn')",
].join(", ");
const EXTERNAL_HEADER_APPLY_FALLBACK_SELECTOR = [
  "a[aria-label*='Apply on company website']",
  "button[aria-label*='Apply on company website']",
  "a[href*='linkedin.com/safety/go']:has-text('Apply')",
  "a[target='_blank'][href*='linkedin.com/safety/go']",
].join(", ");

const SAFETY_REMINDER_TITLE_SELECTOR = [
  "[data-sdui-screen='com.linkedin.sdui.flagshipnav.jobs.PreApplySafetyTipsModal'] h2",
  "#dialog-header h2",
  ".f76ea9ea h2",
  "#dialog-header h2",
  "header h2",
  "h2",
].join(", ");

const CONTINUE_APPLYING_SELECTOR = [
  "[data-sdui-screen='com.linkedin.sdui.flagshipnav.jobs.PreApplySafetyTipsModal'] a:has-text('Continue applying')",
  "[data-sdui-screen='com.linkedin.sdui.flagshipnav.jobs.PreApplySafetyTipsModal'] button:has-text('Continue applying')",
  "a:has-text('Continue applying')",
  "button:has-text('Continue applying')",
  "a[href*='/apply/'][href*='openSDUIApplyFlow=true']",
].join(", ");

const EXTERNAL_APPLICATION_FINISHED_PROMPT_SELECTOR = [
  "p:has-text('Did you finish applying?')",
  "div:has-text('Did you finish applying?')",
].join(", ");

const EXTERNAL_APPLICATION_FINISHED_CONFIRM_SELECTOR = [
  "a:has-text('Yes')",
  "button:has-text('Yes')",
].join(", ");

function buildInlineValidationHelperScript(): string {
  return `
    const jobToolNormalize = (value) => (value ?? "").replace(/\\s+/g, " ").trim();
    const collectInlineValidationMessages = (root, element) => {
      const describedByIds = jobToolNormalize(element.getAttribute("aria-describedby"))
        .split(/\\s+/)
        .filter(Boolean);
      const messages = [];
      const seen = new Set();

      const addMessage = (value) => {
        const message = jobToolNormalize(value);
        if (!message || seen.has(message)) {
          return;
        }
        seen.add(message);
        messages.push(message);
      };

      for (const id of describedByIds) {
        const describedElement = root.ownerDocument?.getElementById(id);
        if (!describedElement || !(root === describedElement || root.contains(describedElement))) {
          continue;
        }
        addMessage(describedElement.textContent);
      }

      const fieldContainer = element.closest(".fb-dash-form-element, .jobs-easy-apply-form-section__grouping, .artdeco-text-input");
      if (fieldContainer) {
        for (const candidate of fieldContainer.querySelectorAll("[role='alert'], .artdeco-inline-feedback__message, .fb-form-element__error")) {
          addMessage(candidate.textContent);
        }
      }

      return messages;
    };
  `;
}

// Reads the currently visible Easy Apply controls and annotates them with job-tool-specific metadata.
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

    ${buildInlineValidationHelperScript()}

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
      const semanticHints = [
        control.getAttribute("id"),
        control.getAttribute("name"),
        control.getAttribute("data-test-form-element"),
        control.getAttribute("aria-describedby"),
        control.getAttribute("placeholder"),
        getLabel(modal, control),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const inlineValidationMessages = collectInlineValidationMessages(modal, control);
      const expectsDecimal = (control.getAttribute("inputmode") || "").toLowerCase() === "decimal"
        || (control.getAttribute("type") || "").toLowerCase() === "number"
        || (control.getAttribute("step") || "").includes(".")
        || semanticHints.includes("numeric")
        || inlineValidationMessages.some((message) => /decimal|numeric|number|say[ıi]|rakam/.test(message.toLowerCase()));
      const isPrefilled = Boolean(
        currentValue &&
        (!options || !["select an option", "choose an option", "please select"].includes(currentValue.toLowerCase())),
      );
      const validationMessage = [
        ...inlineValidationMessages,
        (("validationMessage" in control ? control.validationMessage : "") || "").replace(/\\s+/g, " ").trim(),
      ].find(Boolean) || null;

      results.push({
        fieldKey,
        label: getLabel(modal, control),
        helpText: control.getAttribute("aria-describedby"),
        placeholder: control.getAttribute("placeholder"),
        inputType: normalizeFieldType(inputType),
        currentValue: currentValue || null,
        isPrefilled,
        expectsDecimal,
        validationMessage,
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
  constructor(private page: Page) {}

  // LinkedIn keeps changing the external-apply CTA markup. We first prefer the
  // explicit company-website selectors, then fall back to the generic header
  // Apply CTA only when the page also says responses are managed off LinkedIn.
  private async resolveExternalApplyTrigger(): Promise<{
    locator: Locator;
    detection: EasyApplyExternalDetection;
  } | null> {
    const explicitTrigger = this.page.locator(EXTERNAL_APPLY_TRIGGER_SELECTOR).first();
    if ((await explicitTrigger.count()) > 0) {
      return {
        locator: explicitTrigger,
        detection: {
          source: "explicit_company_website_cta",
          signals: ["selector:explicit_company_website_cta"],
        },
      };
    }

    const offLinkedInSignal = this.page
      .locator(EXTERNAL_RESPONSES_MANAGED_OFF_LINKEDIN_SELECTOR)
      .first();
    if ((await offLinkedInSignal.count()) === 0) {
      return null;
    }

    const fallbackTrigger = this.page
      .locator(EXTERNAL_HEADER_APPLY_FALLBACK_SELECTOR)
      .first();
    return (await fallbackTrigger.count()) > 0
      ? {
          locator: fallbackTrigger,
          detection: {
            source: "header_apply_fallback",
            signals: [
              "signal:responses_managed_off_linkedin",
              "selector:header_apply_fallback",
            ],
          },
        }
      : null;
  }

  private isBlankPage(page: Page): boolean {
    const url = page.url().trim().toLowerCase();
    return url === "" || url === "about:blank";
  }

  private async closeBlankPages(): Promise<void> {
    const pages = this.page.context().pages().filter((page) => !page.isClosed());
    for (const page of pages) {
      if (page === this.page) {
        continue;
      }
      if (!this.isBlankPage(page)) {
        continue;
      }
      await page.close().catch(() => undefined);
    }
  }

  private async adoptNewestPageAfterClick(): Promise<void> {
    const context = this.page.context();
    const activePage = this.page;
    const pages = context.pages().filter((page) => !page.isClosed());
    const newestPage = pages.at(-1);

    if (!newestPage || newestPage === activePage) {
      await this.closeBlankPages();
      return;
    }

    await newestPage.waitForLoadState("domcontentloaded").catch(() => undefined);
    if (this.isBlankPage(newestPage)) {
      await this.closeBlankPages();
      return;
    }
    this.page = newestPage;
    await this.page.bringToFront().catch(() => undefined);
    await this.closeBlankPages();
  }

  private async clickFollowingNewPage(locator: Locator): Promise<void> {
    const originalPage = this.page;
    const popupPromise = this.page.waitForEvent("popup", { timeout: 500 }).catch(() => null);
    await locator.click();
    const popup = await popupPromise;
    if (popup) {
      await popup.waitForLoadState("domcontentloaded").catch(() => undefined);
      let popupNavigated = !this.isBlankPage(popup);
      for (let attempt = 0; attempt < 6 && !popupNavigated; attempt += 1) {
        await popup.waitForTimeout(500).catch(() => undefined);
        popupNavigated = !this.isBlankPage(popup);
      }

      if (popupNavigated && !this.isBlankPage(popup)) {
        this.page = popup;
        await this.page.bringToFront().catch(() => undefined);
      } else {
        await popup.close().catch(() => undefined);
        this.page = originalPage;
      }

      await this.page.waitForTimeout(1_500);
      await this.closeBlankPages();
      return;
    }
    await this.adoptNewestPageAfterClick();
    await this.page.waitForTimeout(1_500);
  }

  private async continuePastSafetyReminder(): Promise<boolean> {
    const title = this.page.locator(SAFETY_REMINDER_TITLE_SELECTOR).filter({
      hasText: /Job search safety reminder/i,
    }).first();
    if ((await title.count()) === 0) {
      return false;
    }

    const continueApplying = this.page.locator(CONTINUE_APPLYING_SELECTOR).filter({
      hasText: /Continue applying/i,
    }).first();
    if ((await continueApplying.count()) === 0) {
      return false;
    }

    await this.clickFollowingNewPage(continueApplying);
    return true;
  }

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

  async isExternalApplyAvailable(): Promise<boolean> {
    return (await this.resolveExternalApplyTrigger()) !== null;
  }

  async getExternalApplyUrl(): Promise<string | null> {
    const resolved = await this.resolveExternalApplyTrigger();
    if (!resolved) {
      return null;
    }
    const locator = resolved.locator;

    const href = await locator.getAttribute("href").catch(() => null);
    if (href) {
      return href;
    }

    const ariaLabel = await locator.getAttribute("aria-label").catch(() => null);
    return ariaLabel ? `linkedin-external:${ariaLabel}` : null;
  }

  async getExternalApplyDetection(): Promise<EasyApplyExternalDetection | null> {
    return (await this.resolveExternalApplyTrigger())?.detection ?? null;
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

  private async waitForEasyApplySurfaceToOpen(): Promise<void> {
    const modal = this.page.locator(".jobs-easy-apply-modal, [role='dialog']").first();

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await modal.waitFor({ state: "visible", timeout: 8_000 });
        return;
      } catch {
        await this.continuePastSafetyReminder().catch(() => undefined);

        if ((await modal.count().catch(() => 0)) > 0) {
          return;
        }

        if (await this.isAlreadyApplied().catch(() => false)) {
          return;
        }

        if (await this.isExternalApplyAvailable().catch(() => false)) {
          return;
        }

        if (attempt === 0) {
          const locator = this.page.locator(EASY_APPLY_TRIGGER_SELECTOR).first();
          if ((await locator.count().catch(() => 0)) > 0) {
            await this.clickFollowingNewPage(locator);
          }
        }
      }
    }

    throw new Error("Easy Apply modal did not open after clicking the trigger.");
  }

  async openEasyApply(): Promise<void> {
    const locator = this.page.locator(EASY_APPLY_TRIGGER_SELECTOR).first();
    await this.clickFollowingNewPage(locator);
    await this.continuePastSafetyReminder().catch(() => undefined);
    await this.waitForEasyApplySurfaceToOpen();
  }

  async collectQuestions(): Promise<EasyApplyQuestionView[]> {
    await this.continuePastSafetyReminder().catch(() => undefined);
    return annotateQuestions(this.page);
  }

  // Collects user-visible LinkedIn feedback so orchestration can persist or react to it.
  async collectSiteFeedback(): Promise<SiteFeedbackSnapshot> {
    await this.continuePastSafetyReminder().catch(() => undefined);
    const dialog = this.page.locator(".jobs-easy-apply-modal, [role='dialog']").first();
    const script = `
      const normalize = (value) => (value ?? "").replace(/\\s+/g, " ").trim();
      const elements = Array.from(
        modal.querySelectorAll([
          "[role='alert']",
          "[aria-live='assertive']",
          "[aria-live='polite']",
          ".artdeco-inline-feedback",
          ".artdeco-inline-feedback__message",
          ".fb-form-element__error",
          ".jobs-easy-apply-form-section__grouping .t-12.t-black--light",
        ].join(", ")),
      );
      const messages = [];
      const seen = new Set();
      for (const element of elements) {
        const message = normalize(element.textContent);
        if (!message || seen.has(message)) {
          continue;
        }
        seen.add(message);
        const className = normalize(element.getAttribute("class")).toLowerCase();
        const ariaLive = normalize(element.getAttribute("aria-live")).toLowerCase();
        const severity =
          className.includes("error") || ariaLive === "assertive"
            ? "error"
            : className.includes("warning")
              ? "warning"
              : "info";
        messages.push({
          severity,
          message,
          source: "linkedin.easy-apply",
        });
      }
      return messages;
    `;

    const messages = await dialog.evaluate(
      (modal, source) => new Function("modal", source)(modal),
      script,
    ).catch(() => []);

    return {
      ...createEmptySiteFeedbackSnapshot(),
      messages,
      errors: messages.filter((message: { severity: string }) => message.severity === "error").map((message: { message: string }) => message.message),
      warnings: messages.filter((message: { severity: string }) => message.severity === "warning").map((message: { message: string }) => message.message),
      infos: messages.filter((message: { severity: string }) => message.severity === "info").map((message: { message: string }) => message.message),
    };
  }

  async confirmExternalApplicationFinished(): Promise<boolean> {
    await this.page.bringToFront().catch(() => undefined);
    const prompt = this.page.locator(EXTERNAL_APPLICATION_FINISHED_PROMPT_SELECTOR).first();
    if ((await prompt.count().catch(() => 0)) === 0) {
      return false;
    }

    const yesAction = this.page.locator(EXTERNAL_APPLICATION_FINISHED_CONFIRM_SELECTOR).filter({
      hasText: /^Yes$/i,
    }).first();
    if ((await yesAction.count().catch(() => 0)) === 0) {
      return false;
    }

    await this.clickFollowingNewPage(yesAction);
    await this.page.waitForLoadState("domcontentloaded").catch(() => undefined);
    return true;
  }

  async collectVisibleJobs() {
    const cards = await this.page.locator(".jobs-search-results__list-item, li.scaffold-layout__list-item")
      .evaluateAll((elements) =>
        elements.map((element) => {
          const htmlElement = element as any;
          const anchor = htmlElement.querySelector(
            "a[href*='/jobs/view/'], .job-card-container__link, .job-card-list__title",
          );
          const href = anchor?.getAttribute("href") ?? "";
          const text = (htmlElement.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
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

  async collectStepState(): Promise<EasyApplyStepStateSnapshot> {
    await this.continuePastSafetyReminder().catch(() => undefined);
    const dialog = this.page.locator(".jobs-easy-apply-modal, [role='dialog']").first();
    const script = `
      const normalize = (value) => (value ?? "").replace(/\\s+/g, " ").trim();
      const buttons = Array.from(modal.querySelectorAll("button"));
      const describeButton = (button) => ({
        label: normalize(button.textContent),
        ariaLabel: normalize(button.getAttribute("aria-label")).toLowerCase(),
        text: normalize(button.textContent).toLowerCase(),
        disabled: Boolean(button.disabled || button.getAttribute("aria-disabled") === "true"),
      });
      const buttonDetails = buttons.map(describeButton);
      const findAction = () => {
        if (buttonDetails.some((button) =>
          button.ariaLabel.includes("submit application") || button.text === "submit application"
        )) {
          return "submit";
        }
        if (buttonDetails.some((button) =>
          button.ariaLabel.includes("review your application") || button.text === "review"
        )) {
          return "review";
        }
        if (buttonDetails.some((button) =>
          button.ariaLabel.includes("continue to next step") || button.text === "next"
        )) {
          return "next";
        }
        return "unknown";
      };

      const titleCandidates = [
        ".jobs-easy-apply-modal__header h2",
        ".jobs-easy-apply-modal__header h3",
        "h1",
        "h2",
      ];
      const headingCandidates = [
        ".jobs-easy-apply-content__title",
        ".jobs-easy-apply-repeatable-groupings__groupings h3",
        ".jobs-easy-apply-form-section__grouping h3",
        ".ph5 h3",
        "h3",
        "legend",
      ];

      const findText = (selectors) => {
        for (const selector of selectors) {
          const element = modal.querySelector(selector);
          const text = normalize(element && element.textContent);
          if (text) {
            return text;
          }
        }
        return null;
      };

      return {
        modalTitle: findText(titleCandidates),
        headingText: findText(headingCandidates),
        primaryAction: findAction(),
        buttonLabels: buttonDetails.map((button) => button.label).filter(Boolean),
      };
    `;

    return dialog.evaluate(
      (modal, source) => new Function("modal", source)(modal),
      script,
    );
  }

  async collectReviewDiagnostics(): Promise<EasyApplyReviewDiagnostics> {
    await this.continuePastSafetyReminder().catch(() => undefined);
    const dialog = this.page.locator(".jobs-easy-apply-modal, [role='dialog']").first();
    const script = `
      const normalize = (value) => (value ?? "").replace(/\\s+/g, " ").trim();
      ${buildInlineValidationHelperScript()}
      const getLabel = (modal, element) => {
        const id = element.getAttribute("id");
        const byFor = id ? modal.querySelector('label[for="' + id + '"]') : null;
        const wrappingLabel = element.closest("label");
        const fieldset = element.closest("fieldset");
        const legend = fieldset ? fieldset.querySelector("legend") : null;
        return normalize(
          (byFor && byFor.textContent) ||
            (wrappingLabel && wrappingLabel.textContent) ||
            (legend && legend.textContent) ||
            element.getAttribute("aria-label") ||
            "",
        );
      };

      const validationMessages = Array.from(
        modal.querySelectorAll(
          [
            "[role='alert']",
            ".artdeco-inline-feedback__message",
            ".fb-form-element__error",
            ".jobs-easy-apply-form-section__grouping .t-12.t-black--light",
          ].join(", "),
        ),
      ).map((element) => normalize(element.textContent)).filter(Boolean);

      const blockingFields = Array.from(modal.querySelectorAll("input, textarea, select"))
        .map((element) => {
          const validationMessage = [
            ...collectInlineValidationMessages(modal, element),
            normalize("validationMessage" in element ? element.validationMessage : ""),
          ].find(Boolean) || "";
          const currentValue =
            element.tagName === "SELECT"
              ? normalize(element.selectedOptions[0] ? element.selectedOptions[0].textContent : "")
              : normalize(element.value);
          const required =
            element.required || element.getAttribute("aria-required") === "true";
          const invalid =
            element.getAttribute("aria-invalid") === "true" || Boolean(validationMessage);

          if (!required && !invalid) {
            return null;
          }

          return {
            fieldKey: element.getAttribute("data-job-tool-field-key") || "",
            label: getLabel(modal, element),
            validationMessage: validationMessage || null,
            currentValue: currentValue || null,
            required,
          };
        })
        .filter(Boolean);

      const buttons = Array.from(modal.querySelectorAll("button"));
      const findButton = (matcher) => buttons.find((button) => matcher(button)) || null;
      const buttonStates = [
        {
          action: "next",
          button: findButton((button) => {
            const ariaLabel = normalize(button.getAttribute("aria-label")).toLowerCase();
            const text = normalize(button.textContent).toLowerCase();
            return (
              button.hasAttribute("data-live-test-easy-apply-next-button") ||
              button.hasAttribute("data-easy-apply-next-button") ||
              ariaLabel.includes("continue to next step") ||
              text === "next"
            );
          }),
        },
        {
          action: "review",
          button: findButton((button) => {
            const ariaLabel = normalize(button.getAttribute("aria-label")).toLowerCase();
            const text = normalize(button.textContent).toLowerCase();
            return (
              button.hasAttribute("data-live-test-easy-apply-review-button") ||
              ariaLabel.includes("review your application") ||
              text === "review"
            );
          }),
        },
        {
          action: "submit",
          button: findButton((button) => {
            const ariaLabel = normalize(button.getAttribute("aria-label")).toLowerCase();
            const text = normalize(button.textContent).toLowerCase();
            return (
              button.hasAttribute("data-live-test-easy-apply-submit-button") ||
              ariaLabel.includes("submit application") ||
              text === "submit application"
            );
          }),
        },
      ].map(({ action, button }) => ({
        action,
        visible: Boolean(button),
        disabled: Boolean(button && (button.disabled || button.getAttribute("aria-disabled") === "true")),
        label: button ? normalize(button.textContent) || null : null,
      }));

      return {
        validationMessages,
        blockingFields,
        buttonStates,
      };
    `;
    const diagnostics = await dialog.evaluate(
      (modal, source) => new Function("modal", source)(modal),
      script,
    );

    return diagnostics;
  }

  async fillAnswer(
    question: EasyApplyQuestionView,
    resolved: ResolvedAnswer,
  ): Promise<{ filled: boolean; details?: string }> {
    // Applies one answer and immediately inspects site-level validation before claiming success.
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
        await locator.evaluate(
          (element, source) => new Function("element", source)(element),
          `
            const input = element;
            input.checked = true;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
          `,
        );
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

    if (question.expectsDecimal) {
      const normalizedNumericValue = value.replace(/\s+/g, "").replace(",", ".");
      if (!/^\d+(\.\d+)?$/.test(normalizedNumericValue) || Number(normalizedNumericValue) <= 0) {
        return {
          filled: false,
          details: "Expected a numeric answer greater than 0 for this LinkedIn field.",
        };
      }
    }

    await locator.fill(value);
    await locator.blur();
    await this.page.waitForTimeout(0);

    const validationMessage = await locator.evaluate((element) => {
      const input = element as {
        getAttribute?: (name: string) => string | null;
        validationMessage?: string;
        ownerDocument?: {
          getElementById?: (id: string) => { textContent?: string | null } | null;
        } | null;
        closest?: (selector: string) => {
          querySelectorAll?: (selector: string) => Iterable<{ textContent?: string | null }>;
        } | null;
      };
      const describedByIds = String(input.getAttribute?.("aria-describedby") ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      const messages: string[] = [];

      const nativeMessage = String(input.validationMessage ?? "").replace(/\s+/g, " ").trim();
      if (nativeMessage) {
        messages.push(nativeMessage);
      }

      const rootDocument = input.ownerDocument;
      for (const id of describedByIds) {
        const describedElement = rootDocument?.getElementById?.(id);
        if (!describedElement) {
          continue;
        }

        const describedText = String(describedElement.textContent ?? "").replace(/\s+/g, " ").trim();
        if (describedText && !messages.includes(describedText)) {
          messages.push(describedText);
        }
      }

      const fieldContainer = input.closest?.(
        ".fb-dash-form-element, .jobs-easy-apply-form-section__grouping, .artdeco-text-input",
      );
      if (fieldContainer) {
        for (const candidate of fieldContainer.querySelectorAll?.(
          "[role='alert'], .artdeco-inline-feedback__message, .fb-form-element__error",
        ) ?? []) {
          const candidateText = String(candidate.textContent ?? "").replace(/\s+/g, " ").trim();
          if (candidateText && !messages.includes(candidateText)) {
            messages.push(candidateText);
          }
        }
      }

      return messages[0] ?? "";
    });
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

  async advance(action: "next" | "review" | "submit"): Promise<void> {
    const locator = action === "review"
      ? this.page
        .locator(
          "[data-live-test-easy-apply-review-button], button[aria-label*='Review your application'], button:has-text('Review')",
        )
        .first()
      : action === "submit"
        ? this.page
          .locator(
            "[data-live-test-easy-apply-submit-button], button[aria-label*='Submit application'], button:has-text('Submit application')",
          )
          .first()
        : this.page
          .locator(
            "[data-live-test-easy-apply-next-button], [data-easy-apply-next-button], button[aria-label*='Continue to next step'], button:has-text('Next')",
          )
          .first();
    await this.clickFollowingNewPage(locator);
  }

  async dismissCompletionModal(): Promise<boolean> {
    const notNow = this.page.locator(
      [
        "button:has-text('Not now')",
        ".job-seeker-nba--modal-footer button.artdeco-button--secondary",
        "[data-view-name='seeker-next-best-action-card-cta-with-impression']",
      ].join(", "),
    ).filter({ hasText: "Not now" }).first();

    if ((await notNow.count()) > 0) {
      await notNow.click();
      await this.page.waitForTimeout(1_000);
      return true;
    }

    const successHeader = this.page.locator(
      ".jpac-modal-header, h3.jpac-modal-header",
    ).filter({ hasText: /Your application was sent to/i }).first();

    if ((await successHeader.count()) === 0) {
      return false;
    }

    const dismissButton = this.page.locator(
      [
        "button[data-test-modal-close-btn]",
        "button.artdeco-modal__dismiss[aria-label='Dismiss']",
        "button[aria-label='Dismiss']",
      ].join(", "),
    ).first();

    if ((await dismissButton.count()) === 0) {
      return false;
    }

    await dismissButton.click();
    await this.page.waitForTimeout(1_000);
    return true;
  }
}
