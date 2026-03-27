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
const LINKEDIN_SIGNED_IN_SELECTORS = [
  "nav[aria-label='Primary Navigation']",
  ".global-nav",
  ".jobs-search-results-list",
  ".jobs-unified-top-card",
];
const LINKEDIN_CHALLENGE_MARKERS = [
  "verify your identity",
  "security verification",
  "checkpoint",
  "two-step verification",
  "confirm your identity",
  "enter the code",
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

async function hasAnyLocator(page: Page, selectors: string[]): Promise<boolean> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count().catch(() => 0)) > 0) {
      return true;
    }
  }

  return false;
}

type LinkedInAuthState = "authenticated" | "login" | "challenge";

async function getLinkedInAuthState(page: Page): Promise<LinkedInAuthState> {
  if (await hasAnyLocator(page, LINKEDIN_SIGNED_IN_SELECTORS)) {
    return "authenticated";
  }

  const currentUrl = page.url().toLowerCase();
  const title = (await page.title().catch(() => "")).toLowerCase();
  const bodyText = (await page.locator("body").innerText().catch(() => "")).toLowerCase();

  if (
    currentUrl.includes("/checkpoint") ||
    LINKEDIN_CHALLENGE_MARKERS.some((marker) => bodyText.includes(marker) || title.includes(marker))
  ) {
    return "challenge";
  }

  if (await isLinkedInSignInWall(page)) {
    return "login";
  }

  return "authenticated";
}

async function waitForLinkedInAuthResolution(
  page: Page,
  timeoutMs = 15_000,
): Promise<LinkedInAuthState> {
  const attempts = Math.max(1, Math.ceil(timeoutMs / 500));

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const state = await getLinkedInAuthState(page);
    if (state !== "login") {
      return state;
    }

    await page.waitForTimeout(500);
  }

  return getLinkedInAuthState(page);
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

    const initialState = await getLinkedInAuthState(page);
    if (initialState === "authenticated") {
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
    const postSubmitState = await waitForLinkedInAuthResolution(page);

    if (postSubmitState === "challenge") {
      throw new AppError({
        message: "LinkedIn login reached a verification challenge. Manual verification is required before automation can continue.",
        phase: "linkedin_auth",
        code: "LINKEDIN_AUTHENTICATION_CHALLENGE",
        details: { url: page.url(), title: await page.title() },
      });
    }

    await gotoJobPage(page, url);

    const finalState = await waitForLinkedInAuthResolution(page, 5_000);
    if (finalState === "challenge") {
      throw new AppError({
        message: "LinkedIn redirected to a verification challenge after login. Manual verification is required before automation can continue.",
        phase: "linkedin_auth",
        code: "LINKEDIN_AUTHENTICATION_CHALLENGE",
        details: { url: page.url(), title: await page.title() },
      });
    }

    if (finalState !== "authenticated") {
      throw new AppError({
        message: "LinkedIn authentication did not unlock the job page. The session may need manual verification.",
        phase: "linkedin_auth",
        code: "LINKEDIN_AUTHENTICATION_FAILED",
        details: { url: page.url(), title: await page.title() },
      });
    }
  }
