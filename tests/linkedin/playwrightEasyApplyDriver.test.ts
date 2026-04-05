import { chromium, type Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  linkedInExternalApplyHeaderHtml,
  linkedInApplicationSentModalHtml,
  linkedInPreReviewModalHtml,
  linkedInReviewModalHtml,
  linkedInSafetyReminderModalHtml,
  linkedInSafetyReminderNoDialogHtml,
} from "../fixtures/linkedin.js";
import { PlaywrightLinkedInEasyApplyDriver } from "../../src/linkedin/playwrightEasyApplyDriver.js";

describe("PlaywrightLinkedInEasyApplyDriver", () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser.close();
  });

  it("detects the pre-review modal state from real LinkedIn-like HTML", async () => {
    const page = await browser.newPage();
    await page.setContent(linkedInPreReviewModalHtml);

    const driver = new PlaywrightLinkedInEasyApplyDriver(page);
    const result = await driver.collectStepState();

    expect(result).toEqual({
      modalTitle: "Apply to Crossing Hurdles",
      headingText: "Education",
      primaryAction: "review",
      buttonLabels: ["Back", "Review"],
    });

    await page.close();
  });

  it("detects the review modal state and submit button from real LinkedIn-like HTML", async () => {
    const page = await browser.newPage();
    await page.setContent(linkedInReviewModalHtml);

    const driver = new PlaywrightLinkedInEasyApplyDriver(page);
    const result = await driver.collectStepState();

    expect(result).toEqual({
      modalTitle: "Apply to Crossing Hurdles",
      headingText: "Review your application",
      primaryAction: "submit",
      buttonLabels: ["Back", "Submit application"],
    });

    await page.close();
  });

  it("collects review diagnostics from real LinkedIn-like review HTML", async () => {
    const page = await browser.newPage();
    await page.setContent(linkedInReviewModalHtml);

    const driver = new PlaywrightLinkedInEasyApplyDriver(page);
    const result = await driver.collectReviewDiagnostics();

    expect(result.validationMessages).toEqual([]);
    expect(result.blockingFields).toEqual([]);
    expect(result.buttonStates).toEqual([
      {
        action: "next",
        visible: false,
        disabled: false,
        label: null,
      },
      {
        action: "review",
        visible: false,
        disabled: false,
        label: null,
      },
      {
        action: "submit",
        visible: true,
        disabled: false,
        label: "Submit application",
      },
    ]);

    await page.close();
  });

  it("dismisses the application-sent modal through the X button when Not now is not present", async () => {
    const page = await browser.newPage();
    await page.setContent(linkedInApplicationSentModalHtml);

    const driver = new PlaywrightLinkedInEasyApplyDriver(page);
    const dismissed = await driver.dismissCompletionModal();

    expect(dismissed).toBe(true);
    expect(await page.locator(".jpac-modal-header").count()).toBe(0);

    await page.close();
  });

  it("detects already-applied linkedin jobs from the see-application badge", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <div class="jobs-s-apply jobs-s-apply--fadein inline-flex mr2">
        <div class="artdeco-inline-feedback artdeco-inline-feedback--success" role="alert">
          <span class="artdeco-inline-feedback__message">Applied 4 minutes ago</span>
        </div>
        <a id="jobs-apply-see-application-link" href="/jobs-tracker?stage=applied" class="jobs-s-apply__application-link">
          See application
          <span class="a11y-text">Applied 4 minutes ago for Full Stack Engineer</span>
        </a>
      </div>
    `);

    const driver = new PlaywrightLinkedInEasyApplyDriver(page);
    const alreadyApplied = await driver.isAlreadyApplied();

    expect(alreadyApplied).toBe(true);

    await page.close();
  });

  it("continues past the job search safety reminder modal instead of stopping on it", async () => {
    const page = await browser.newPage();
    await page.setContent(linkedInSafetyReminderModalHtml);

    const driver = new PlaywrightLinkedInEasyApplyDriver(page);
    await driver.openEasyApply();
    const result = await driver.collectStepState();

    expect(result).toEqual({
      modalTitle: "Apply to TravelShop Turkey",
      headingText: null,
      primaryAction: "review",
      buttonLabels: ["Review"],
    });

    await page.close();
  });

  it("continues past the safety reminder when LinkedIn renders it without role=dialog", async () => {
    const page = await browser.newPage();
    await page.setContent(linkedInSafetyReminderNoDialogHtml);

    const driver = new PlaywrightLinkedInEasyApplyDriver(page);
    await driver.openEasyApply();
    const result = await driver.collectStepState();

    expect(result).toEqual({
      modalTitle: "Apply to TravelShop Turkey",
      headingText: null,
      primaryAction: "review",
      buttonLabels: ["Review"],
    });

    await page.close();
  });

  it("adopts the popup page when LinkedIn opens the safety reminder in a new tab", async () => {
    const page = await browser.newPage();
    const popupPage = await browser.newPage();
    await page.setContent(`
      <button id="easy-apply-trigger" type="button" aria-label="Easy Apply to TravelShop Turkey">
        Easy Apply
      </button>
    `);
    await popupPage.goto(`data:text/html,${encodeURIComponent(`
      <div
        data-test-modal=""
        role="dialog"
        tabindex="-1"
        class="artdeco-modal artdeco-modal--layer-default jobs-easy-apply-modal"
        aria-labelledby="jobs-apply-header"
      >
        <div class="artdeco-modal__header ember-view">
          <h2 id="jobs-apply-header">Apply to TravelShop Turkey</h2>
        </div>
        <div class="artdeco-modal__content jobs-easy-apply-modal__content p0 ember-view">
          <form>
            <footer role="presentation">
              <div class="display-flex justify-flex-end ph5 pv4">
                <button aria-label="Review your application" data-live-test-easy-apply-review-button="" type="button">
                  <span class="artdeco-button__text">Review</span>
                </button>
              </div>
            </footer>
          </form>
        </div>
      </div>
    `)}`);
    vi.spyOn(page, "waitForEvent").mockResolvedValue(popupPage as never);

    const driver = new PlaywrightLinkedInEasyApplyDriver(page);
    await driver.openEasyApply();
    const result = await driver.collectStepState();

    expect(result).toEqual({
      modalTitle: "Apply to TravelShop Turkey",
      headingText: null,
      primaryAction: "review",
      buttonLabels: ["Review"],
    });
    expect(page.context().pages().filter((candidate) => !candidate.isClosed())).toHaveLength(1);
  });

  it("ignores about:blank popups and keeps the original page active", async () => {
    const page = await browser.newPage();
    const blankPopup = await browser.newPage();
    await page.setContent(`
      <button id="easy-apply-trigger" type="button" aria-label="Easy Apply to TravelShop Turkey">
        Easy Apply
      </button>
      <div
        data-test-modal=""
        role="dialog"
        tabindex="-1"
        class="artdeco-modal artdeco-modal--layer-default jobs-easy-apply-modal"
        aria-labelledby="jobs-apply-header"
      >
        <div class="artdeco-modal__header ember-view">
          <h2 id="jobs-apply-header">Apply to TravelShop Turkey</h2>
        </div>
        <div class="artdeco-modal__content jobs-easy-apply-modal__content p0 ember-view">
          <form>
            <footer role="presentation">
              <div class="display-flex justify-flex-end ph5 pv4">
                <button aria-label="Review your application" data-live-test-easy-apply-review-button="" type="button">
                  <span class="artdeco-button__text">Review</span>
                </button>
              </div>
            </footer>
          </form>
        </div>
      </div>
    `);
    vi.spyOn(page, "waitForEvent").mockResolvedValue(blankPopup as never);

    const driver = new PlaywrightLinkedInEasyApplyDriver(page);
    await driver.openEasyApply();
    const result = await driver.collectStepState();

    expect(result).toEqual({
      modalTitle: "Apply to TravelShop Turkey",
      headingText: null,
      primaryAction: "review",
      buttonLabels: ["Review"],
    });
    expect(blankPopup.isClosed()).toBe(true);
  });

  it("confirms the external application completion prompt by clicking Yes", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <main>
        <div>
          <p>Did you finish applying?</p>
          <p>You'll find this job under <strong>In progress</strong>.</p>
          <a href="#">Yes</a>
          <button type="button">No</button>
        </div>
      </main>
    `);

    const driver = new PlaywrightLinkedInEasyApplyDriver(page);
    const confirmed = await driver.confirmExternalApplicationFinished();

    expect(confirmed).toBe(true);
    await page.close();
  });

  it("detects external apply from the off-linkedin response signal plus header apply CTA", async () => {
    const page = await browser.newPage();
    await page.setContent(linkedInExternalApplyHeaderHtml);

    const driver = new PlaywrightLinkedInEasyApplyDriver(page);

    await expect(driver.isExternalApplyAvailable()).resolves.toBe(true);
    await expect(driver.getExternalApplyUrl()).resolves.toBe(
      "https://www.linkedin.com/safety/go/?url=https%3A%2F%2Fjobs%2Elever%2Eco%2Fcommencis%2Fa3be10ef-53ab-4842-b114-ae9f60b43e99&urlhash=kEke&isSdui=true",
    );

    await page.close();
  });

  it("marks linkedin numeric text inputs as decimal fields and captures inline validation text", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <div
        data-test-modal=""
        role="dialog"
        tabindex="-1"
        class="artdeco-modal artdeco-modal--layer-default jobs-easy-apply-modal"
      >
        <div class="fb-dash-form-element">
          <div class="artdeco-text-input">
            <div class="artdeco-text-input--container">
              <label for="salary-field-numeric">Net ücret beklentiniz nedir?</label>
              <input
                id="salary-field-numeric"
                class="fb-dash-form-element__error-field artdeco-text-input--input"
                aria-describedby="salary-field-numeric-error"
                type="text"
                inputmode="text"
                required
              />
            </div>
          </div>
          <div id="salary-field-numeric-error">
            <div class="artdeco-inline-feedback artdeco-inline-feedback--error" role="alert">
              <span class="artdeco-inline-feedback__message">0.0 değerinden büyük bir decimal sayısı girin</span>
            </div>
          </div>
        </div>
        <footer role="presentation">
          <button aria-label="Review your application" data-live-test-easy-apply-review-button="" type="button">
            <span class="artdeco-button__text">Review</span>
          </button>
        </footer>
      </div>
    `);

    const driver = new PlaywrightLinkedInEasyApplyDriver(page);
    const questions = await driver.collectQuestions();
    const diagnostics = await driver.collectReviewDiagnostics();

    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({
      label: "Net ücret beklentiniz nedir?",
      expectsDecimal: true,
      validationMessage: "0.0 değerinden büyük bir decimal sayısı girin",
    });
    expect(diagnostics.validationMessages).toContain("0.0 değerinden büyük bir decimal sayısı girin");
    expect(diagnostics.blockingFields[0]).toMatchObject({
      label: "Net ücret beklentiniz nedir?",
      validationMessage: "0.0 değerinden büyük bir decimal sayısı girin",
      required: true,
    });

    await page.close();
  });

  it("refuses to fill non-numeric answers into linkedin decimal fields", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <div
        data-test-modal=""
        role="dialog"
        tabindex="-1"
        class="artdeco-modal artdeco-modal--layer-default jobs-easy-apply-modal"
      >
        <div class="fb-dash-form-element">
          <label for="salary-field-numeric">Net ücret beklentiniz nedir?</label>
          <input id="salary-field-numeric" type="text" inputmode="text" />
        </div>
      </div>
    `);

    const driver = new PlaywrightLinkedInEasyApplyDriver(page);
    const [question] = await driver.collectQuestions();
    const result = await driver.fillAnswer(question, {
      questionType: "salary",
      strategy: "generated",
      answer: "negotiable",
      confidence: 0.7,
      confidenceLabel: "medium",
      source: "llm",
    });

    expect(result).toEqual({
      filled: false,
      details: "Expected a numeric answer greater than 0 for this LinkedIn field.",
    });
    expect(await page.locator("#salary-field-numeric").inputValue()).toBe("");

    await page.close();
  });

  it("returns LinkedIn inline validation after filling a numeric field", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <div
        data-test-modal=""
        role="dialog"
        tabindex="-1"
        class="artdeco-modal artdeco-modal--layer-default jobs-easy-apply-modal"
      >
        <div class="fb-dash-form-element">
          <div class="artdeco-text-input">
            <div class="artdeco-text-input--container">
              <label for="salary-field-numeric">Net ücret beklentiniz nedir?</label>
              <input
                id="salary-field-numeric"
                type="text"
                inputmode="text"
                aria-describedby="salary-field-numeric-error"
              />
            </div>
          </div>
          <div id="salary-field-numeric-error">
            <div class="artdeco-inline-feedback artdeco-inline-feedback--error" role="alert">
              <span class="artdeco-inline-feedback__message"></span>
            </div>
          </div>
        </div>
      </div>
      <script>
        const input = document.getElementById("salary-field-numeric");
        const message = document.querySelector(".artdeco-inline-feedback__message");
        input.addEventListener("blur", () => {
          if (input.value === "1") {
            message.textContent = "0.0 değerinden büyük bir decimal sayısı girin";
            input.setAttribute("aria-invalid", "true");
          }
        });
      </script>
    `);

    const driver = new PlaywrightLinkedInEasyApplyDriver(page);
    const [question] = await driver.collectQuestions();
    const result = await driver.fillAnswer(question, {
      questionType: "salary",
      strategy: "generated",
      answer: "1",
      confidence: 0.7,
      confidenceLabel: "medium",
      source: "llm",
    });

    expect(result).toEqual({
      filled: false,
      details: "0.0 değerinden büyük bir decimal sayısı girin",
    });

    await page.close();
  });
});
