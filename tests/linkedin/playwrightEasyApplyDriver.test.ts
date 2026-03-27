import { chromium, type Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
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
});
