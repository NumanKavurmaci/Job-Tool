import { chromium, type Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
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
});
