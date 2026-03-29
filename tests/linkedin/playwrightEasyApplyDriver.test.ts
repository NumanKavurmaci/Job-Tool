import { chromium, type Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  linkedInApplicationSentModalHtml,
  linkedInPreReviewModalHtml,
  linkedInReviewModalHtml,
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
});
