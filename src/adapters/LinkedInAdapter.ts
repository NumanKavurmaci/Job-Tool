import type { Page } from "@playwright/test";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import type { ExtractedJobContent, JobAdapter } from "./types.js";
import {
  compactText,
  extractSectionText,
  getAttributeBySelectors,
  getCurrentUrl,
  getTextBySelectors,
  gotoJobPage,
  optionalText,
} from "./helpers.js";

const LINKEDIN_LOGIN_URL = "https://www.linkedin.com/login";
const LINKEDIN_USERNAME_SELECTORS = [
  "input[name='session_key']",
  "input[name='username']",
  "input#username",
  "input[autocomplete='username']",
];
const LINKEDIN_PASSWORD_SELECTORS = [
  "input[name='session_password']",
  "input[name='password']",
  "input#password",
  "input[autocomplete='current-password']",
];

async function firstVisibleLocator(page: Page, selectors: string[]) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0) {
      return locator;
    }
  }

  return null;
}

async function waitForLocator(
  page: Page,
  selectors: string[],
  timeoutMs = 10_000,
): Promise<ReturnType<typeof page.locator> | null> {
  const attempts = Math.max(1, Math.ceil(timeoutMs / 500));

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const locator = await firstVisibleLocator(page, selectors);
    if (locator) {
      return locator;
    }

    await page.waitForTimeout(500);
  }

  return null;
}

export async function isLinkedInSignInWall(page: Page): Promise<boolean> {
  const currentUrl = page.url().toLowerCase();
  if (currentUrl.includes("/login") || currentUrl.includes("/checkpoint")) {
    return true;
  }

  const title = (await page.title()).toLowerCase();
  if (title.includes("sign in") || title.includes("login")) {
    return true;
  }

  const bodyText = (await page.locator("body").innerText().catch(() => "")).toLowerCase();
  return bodyText.includes("sign in") && bodyText.includes("linkedin");
}

export class LinkedInAdapter implements JobAdapter {
  name = "linkedin";

  canHandle(url: string): boolean {
    return url.includes("linkedin.com/jobs");
  }

  private async ensureAuthenticated(page: Page, url: string): Promise<void> {
    await ensureLinkedInAuthenticated(page, url);
  }

  async extract(page: Page, url: string): Promise<ExtractedJobContent> {
    await this.ensureAuthenticated(page, url);
    const pageBodyText = await page.locator("body").innerText().catch(() => "");

    const title =
      (await getTextBySelectors(page, [
        ".job-details-jobs-unified-top-card__job-title",
        ".jobs-unified-top-card__job-title",
        ".top-card-layout__title",
        "h1",
      ])) ?? optionalText(await page.title());

    const company = await getTextBySelectors(page, [
      ".job-details-jobs-unified-top-card__company-name",
      ".jobs-unified-top-card__company-name",
      ".topcard__org-name-link",
      "[class*='company-name']",
      "[class*='company']",
    ]);

    const location = await getTextBySelectors(page, [
      ".job-details-jobs-unified-top-card__bullet",
      ".topcard__flavor--bullet",
      ".job-details-jobs-unified-top-card__primary-description-container",
      "[class*='job-location']",
      "[class*='location']",
    ]);

    const applyUrl =
      (await getAttributeBySelectors(
        page,
        [
          "a[href*='linkedin.com/jobs/view']",
          "a[href*='easy-apply']",
          "a[href*='apply']",
        ],
        "href",
      )) ?? (await getCurrentUrl(page));

    const descriptionText = await extractSectionText(page, [
      ".jobs-description-content__text",
      ".show-more-less-html__markup",
      ".jobs-box__html-content",
      "main",
      "article",
      "body",
    ]);

    const requirementsText = await extractSectionText(page, [
      "[class*='qualification']",
      "[class*='requirement']",
      "[data-testid='job-details-how-you-match-card']",
    ]);

    const benefitsText = await extractSectionText(page, [
      "[class*='benefit']",
      "[class*='perk']",
    ]);

    const easyApplyText = [
      pageBodyText,
      await getTextBySelectors(page, [
        "button[aria-label*='Easy Apply']",
        "button[aria-label*='Easy apply']",
        "button.jobs-apply-button",
        ".jobs-apply-button",
        "[data-control-name='jobdetails_topcard_inapply']",
      ]),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const bodyLower = pageBodyText.toLowerCase();
    const applicationType = easyApplyText.includes("easy apply")
      ? "easy_apply"
      : bodyLower.includes("apply on company website") || bodyLower.includes("apply on company site")
        ? "external"
        : "unknown";

    const focusedRawText = compactText(
      [
        title ? `Title: ${title}` : null,
        company ? `Company: ${company}` : null,
        location ? `Location: ${location}` : null,
        `Application Type: ${applicationType}`,
        descriptionText ? `Description:\n${descriptionText}` : null,
        requirementsText ? `Requirements:\n${requirementsText}` : null,
        benefitsText ? `Benefits:\n${benefitsText}` : null,
      ]
        .filter(Boolean)
        .join("\n\n"),
    );

    return {
      rawText: focusedRawText,
      title,
      company,
      location,
      platform: this.name,
      applicationType,
      applyUrl,
      currentUrl: await getCurrentUrl(page),
      descriptionText,
      requirementsText,
      benefitsText,
    };
  }
}

export async function ensureLinkedInAuthenticated(page: Page, url: string): Promise<void> {
    await gotoJobPage(page, url);

    if (!(await isLinkedInSignInWall(page))) {
      return;
    }

    if (!env.LINKEDIN_USERNAME || !env.LINKEDIN_PASSWORD) {
      throw new AppError({
        message: "LinkedIn job pages require authentication. Set LINKEDIN_USERNAME and LINKEDIN_PASSWORD to continue.",
        phase: "linkedin_auth",
        code: "LINKEDIN_CREDENTIALS_MISSING",
      });
    }

    let usernameInput = await waitForLocator(page, LINKEDIN_USERNAME_SELECTORS, 5_000);
    let passwordInput = await waitForLocator(page, LINKEDIN_PASSWORD_SELECTORS, 5_000);

    if (!usernameInput || !passwordInput) {
      await page.goto(LINKEDIN_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForTimeout(1_000);
      usernameInput = await waitForLocator(page, LINKEDIN_USERNAME_SELECTORS, 10_000);
      passwordInput = await waitForLocator(page, LINKEDIN_PASSWORD_SELECTORS, 10_000);
    }

    const submitButton = page.locator("button[type='submit']").first();

    if (!usernameInput || !passwordInput) {
      throw new AppError({
        message: "LinkedIn login form was not detected.",
        phase: "linkedin_auth",
        code: "LINKEDIN_LOGIN_FORM_NOT_FOUND",
        details: { url: page.url(), title: await page.title() },
      });
    }

    await usernameInput.fill(env.LINKEDIN_USERNAME);
    await passwordInput.fill(env.LINKEDIN_PASSWORD);
    await submitButton.click();
    await page.waitForTimeout(3_000);
    await gotoJobPage(page, url);

    if (await isLinkedInSignInWall(page)) {
      throw new AppError({
        message: "LinkedIn authentication did not unlock the job page. The session may need manual verification.",
        phase: "linkedin_auth",
        code: "LINKEDIN_AUTHENTICATION_FAILED",
        details: { url: page.url(), title: await page.title() },
      });
    }
  }
