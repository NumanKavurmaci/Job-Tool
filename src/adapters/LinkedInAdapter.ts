import type { Page } from "@playwright/test";
import { env } from "../config/env.js";
import { capturePageArtifacts } from "../utils/artifacts.js";
import { AppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
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
const LINKEDIN_SUBMIT_SELECTORS = [
  "button[type='submit'][aria-label*='Sign in']",
  "button[type='submit'][data-litms-control-urn='login-submit']",
  "button[type='submit'].btn__primary--large",
  "button[type='submit']:has-text('Sign in')",
  "button[type='submit']",
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
const LINKEDIN_TITLE_SELECTORS = [
  ".job-details-jobs-unified-top-card__job-title",
  ".jobs-unified-top-card__job-title",
  ".top-card-layout__title",
  "h1",
  "[data-test-id='job-title']",
  "p[data-test-id='job-title']",
];
const LINKEDIN_COMPANY_SELECTORS = [
  ".job-details-jobs-unified-top-card__company-name",
  ".jobs-unified-top-card__company-name",
  ".topcard__org-name-link",
  "[data-test-id='job-company-name']",
  "a[href*='linkedin.com/company/'][componentkey] p",
  "a[href*='linkedin.com/company/'] p",
];
const LINKEDIN_COMPANY_ARIA_SELECTORS = [
  "a[href*='linkedin.com/company/'][aria-label*='Company']",
  "a[href*='linkedin.com/company/'] [aria-label*='Company']",
  "[aria-label^='Company,']",
];
const LINKEDIN_COMPANY_LOGO_SELECTORS = [
  "a[href*='linkedin.com/company/'] img[alt*='Company logo']",
  "img[alt*='Company logo for']",
  "a[href*='linkedin.com/company/'] img",
];
const LINKEDIN_COMPANY_URL_SELECTORS = [
  "a[href*='linkedin.com/company/'][componentkey]",
  "a[href*='linkedin.com/company/']",
];
const LINKEDIN_LOCATION_SELECTORS = [
  ".job-details-jobs-unified-top-card__bullet",
  ".topcard__flavor--bullet",
  ".job-details-jobs-unified-top-card__primary-description-container",
  "[data-test-id='job-location']",
];
const LINKEDIN_ABOUT_TEXT_SELECTORS = [
  "[data-testid='expandable-text-box']",
  ".jobs-description-content__text",
  ".show-more-less-html__markup",
  ".jobs-box__html-content",
];
const LINKEDIN_ABOUT_EXPAND_BUTTON_SELECTORS = [
  "[data-testid='expandable-text-button']",
  "button[data-testid='expandable-text-button']",
  "button:has-text('more')",
  "button:has-text('Show more')",
];
const LINKEDIN_BADGE_SELECTORS = [
  ".jobs-unified-top-card__job-insight",
  ".jobs-unified-top-card__job-insight span",
  ".job-details-jobs-unified-top-card__job-insight",
  ".job-details-jobs-unified-top-card__job-insight span",
  ".job-details-fit-level-preferences button",
  ".job-details-fit-level-preferences .tvm__text",
  ".job-details-fit-level-preferences .visually-hidden",
  "a[href*='linkedin.com/jobs/view'] span",
];
const LINKEDIN_ABOUT_COMPANY_SELECTORS = [
  "[data-testid='about-company-module']",
  "[data-test-id='about-company']",
  ".jobs-company__box",
];

function parseLinkedInPageTitle(
  pageTitle: string | null,
): { title: string | null; company: string | null; location: string | null } {
  const cleaned = optionalText(pageTitle?.replace(/\|\s*LinkedIn$/i, ""));
  if (!cleaned) {
    return {
      title: null,
      company: null,
      location: null,
    };
  }

  const hiringMatch = cleaned.match(/^(.+?)\s+hiring\s+(.+?)\s+in\s+(.+)$/i);
  if (hiringMatch) {
    return {
      company: optionalText(hiringMatch[1]),
      title: optionalText(hiringMatch[2]),
      location: optionalText(hiringMatch[3]),
    };
  }

  const parts = cleaned
    .split("|")
    .map((part) => optionalText(part))
    .filter((part): part is string => Boolean(part));

  return {
    title: parts[0] ?? null,
    location: parts.length > 2 ? parts[1] ?? null : null,
    company: parts.length > 1 ? parts[parts.length - 1] ?? null : null,
  };
}

function cleanLinkedInTitle(
  value: string | null | undefined,
  location: string | null | undefined,
): string | null {
  const normalized = optionalText(value);
  if (!normalized) {
    return null;
  }

  const normalizedLocation = optionalText(location)?.toLowerCase();
  const parts = normalized
    .split("|")
    .map((part) => optionalText(part))
    .filter((part): part is string => Boolean(part));

  if (parts.length <= 1) {
    return normalized;
  }

  const filtered = parts.filter((part, index) => {
    if (index === 0) {
      return true;
    }

    if (normalizedLocation && part.toLowerCase() === normalizedLocation) {
      return false;
    }

    return !/\b(remote|hybrid|onsite|on-site)\b/i.test(part);
  });

  return filtered[0] ?? normalized;
}

function parseLinkedInCompanyAriaLabel(value: string | null | undefined): string | null {
  const normalized = optionalText(value);
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^Company,\s*(.+?)[\.\s]*$/i);
  return optionalText(match?.[1] ?? normalized);
}

function parseLinkedInAboutCompanyName(text: string | null | undefined): string | null {
  const normalized = optionalText(text);
  if (!normalized) {
    return null;
  }

  const lines = normalized
    .split("\n")
    .map((line) => optionalText(line))
    .filter((line): line is string => Boolean(line));

  for (const line of lines) {
    if (/^about the company$/i.test(line)) {
      continue;
    }

    if (
      /\bfollowers\b/i.test(line) ||
      /\bemployees\b/i.test(line) ||
      /\bon linkedin\b/i.test(line) ||
      /^following$/i.test(line) ||
      /^i['’]m interested$/i.test(line)
    ) {
      continue;
    }

    if (/^[A-Z][\w&.,'()\-\/ ]{1,100}$/.test(line)) {
      return line;
    }
  }

  return null;
}

function parseLinkedInLabeledField(
  text: string | null | undefined,
  label: string,
): string | null {
  const normalized = optionalText(text);
  if (!normalized) {
    return null;
  }

  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^${escapedLabel}:\\s*(.+)$`, "i");
  const lines = normalized
    .split("\n")
    .map((line) => optionalText(line))
    .filter((line): line is string => Boolean(line));

  for (const line of lines) {
    const match = line.match(regex);
    if (match?.[1]) {
      return optionalText(match[1]);
    }
  }

  return null;
}

function parseLinkedInWorkplaceType(values: string[]): "remote" | "hybrid" | "onsite" | null {
  const normalized = values.join("\n").toLowerCase();

  if (!normalized) {
    return null;
  }

  if (
    /\bworkplace type is remote\b/.test(normalized) ||
    /(^|\n)\s*remote\s*($|\n)/.test(normalized)
  ) {
    return "remote";
  }

  if (
    /\bworkplace type is hybrid\b/.test(normalized) ||
    /(^|\n)\s*hybrid\s*($|\n)/.test(normalized)
  ) {
    return "hybrid";
  }

  if (
    /\bworkplace type is on-?site\b/.test(normalized) ||
    /(^|\n)\s*on-?site\s*($|\n)/.test(normalized) ||
    /(^|\n)\s*onsite\s*($|\n)/.test(normalized)
  ) {
    return "onsite";
  }

  return null;
}

function sanitizeLinkedInLocation(value: string | null | undefined): string | null {
  const normalized = optionalText(value);
  if (!normalized) {
    return null;
  }

  const cleanSegment = (segment: string | null | undefined) =>
    optionalText(segment)?.replace(/\s*Â+\s*$/g, "").trim() ?? null;

  const firstLine = normalized.split("\n")[0]?.trim() ?? normalized;
  const parts = firstLine
    .split("·")
    .map((part) => cleanSegment(part))
    .filter((part): part is string => Boolean(part));

  for (const part of parts) {
    if (
      /\b\d+\s+(day|days|week|weeks|month|months|hour|hours)\s+ago\b/i.test(part) ||
      /\bapplicant/i.test(part) ||
      /\bpromoted by\b/i.test(part) ||
      /\bactively reviewing applicants\b/i.test(part)
    ) {
      continue;
    }

    if (/^(remote|hybrid|on-?site|onsite)$/i.test(part)) {
      continue;
    }

    return cleanSegment(part);
  }

  return cleanSegment(parts[0] ?? normalized);
}

function isGenericLinkedInWorkplaceLocation(value: string | null | undefined): boolean {
  const normalized = optionalText(value)?.toLowerCase();
  if (!normalized) {
    return false;
  }

  return /^(remote|hybrid|on-?site|onsite)$/i.test(normalized);
}

function uniqueText(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = optionalText(value);
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function flattenTextLines(values: string[]): string[] {
  return uniqueText(
    values.flatMap((value) =>
      value
        .split("\n")
        .map((line) => optionalText(line))
        .filter((line): line is string => Boolean(line)),
    ),
  );
}

function inferLocationFromBodyText(bodyText: string): string | null {
  const lines = flattenTextLines([bodyText]);

  for (const line of lines) {
    if (
      /\b(remote|hybrid|on-site|onsite)\b/i.test(line) &&
      /[a-zA-ZğüşöçıİĞÜŞÖÇ]/.test(line)
    ) {
      return line;
    }

    if (/\b(türkiye|turkey|ankara|izmir|eskişehir|eskisehir|samsun|istanbul)\b/i.test(line)) {
      return line;
    }
  }

  return null;
}

async function getTextsBySelectors(page: Page, selectors: string[]): Promise<string[]> {
  const values: string[] = [];

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count().catch(() => 0)) === 0) {
      continue;
    }

    const text = optionalText(await locator.innerText().catch(() => null));
    if (text) {
      values.push(text);
    }
  }

  return uniqueText(values);
}

async function expandLinkedInAboutSection(page: Page): Promise<void> {
  const button = await firstVisibleLocator(page, LINKEDIN_ABOUT_EXPAND_BUTTON_SELECTORS);
  if (!button) {
    return;
  }

  await button.click().catch(() => undefined);
  await page.waitForTimeout(500);
}

function parseLinkedInAboutSections(text: string | null): {
  descriptionText: string | null;
  requirementsText: string | null;
  benefitsText: string | null;
} {
  const normalized = compactText(text);
  if (!normalized) {
    return {
      descriptionText: null,
      requirementsText: null,
      benefitsText: null,
    };
  }

  const lines = normalized
    .split("\n")
    .map((line) => optionalText(line))
    .filter((line): line is string => Boolean(line));

  const headings = {
    requirements: /^(requirements|qualifications|what you bring|skills required)$/i,
    benefits: /^(benefits|perks|what we offer|why join us)$/i,
    stop: /^(application process|how to apply|about the company)$/i,
  };

  const description: string[] = [];
  const requirements: string[] = [];
  const benefits: string[] = [];
  let current: "description" | "requirements" | "benefits" = "description";

  for (const line of lines) {
    if (headings.requirements.test(line)) {
      current = "requirements";
      continue;
    }

    if (headings.benefits.test(line)) {
      current = "benefits";
      continue;
    }

    if (headings.stop.test(line)) {
      current = "description";
      continue;
    }

    if (current === "requirements") {
      requirements.push(line);
      continue;
    }

    if (current === "benefits") {
      benefits.push(line);
      continue;
    }

    description.push(line);
  }

  return {
    descriptionText: compactText(description.join("\n")) || null,
    requirementsText: compactText(requirements.join("\n")) || null,
    benefitsText: compactText(benefits.join("\n")) || null,
  };
}

async function firstVisibleLocator(page: Page, selectors: string[]) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0) {
      return locator;
    }
  }

  return null;
}

async function requireLocator(
  page: Page,
  selectors: string[],
  errorFactory: () => Promise<AppError>,
  timeoutMs = 10_000,
) {
  const locator = await waitForLocator(page, selectors, timeoutMs);
  if (locator) {
    return locator;
  }

  throw await errorFactory();
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

function isLikelyAuthenticatedLinkedInRoute(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!/linkedin\.com$/i.test(parsed.hostname) && !/\.linkedin\.com$/i.test(parsed.hostname)) {
      return false;
    }

    const path = parsed.pathname.toLowerCase();
    if (
      path.startsWith("/login") ||
      path.startsWith("/signup") ||
      path.startsWith("/checkpoint") ||
      path.startsWith("/uas/login")
    ) {
      return false;
    }

    return (
      path.startsWith("/feed") ||
      path.startsWith("/jobs") ||
      path.startsWith("/mynetwork") ||
      path.startsWith("/messaging") ||
      path.startsWith("/notifications") ||
      path.startsWith("/in/")
    );
  } catch {
    return false;
  }
}

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

  if (isLikelyAuthenticatedLinkedInRoute(currentUrl)) {
    return "authenticated";
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

async function waitForManualLinkedInIntervention(
  page: Page,
  url: string,
  timeoutMs = env.LINKEDIN_MANUAL_AUTH_WINDOW_MS,
): Promise<boolean> {
  logger.info(
    {
      event: "linkedin.auth.manual_recovery.started",
      url: page.url(),
      timeoutMs,
    },
    "Waiting for manual LinkedIn authentication recovery",
  );

  const attempts = Math.max(1, Math.ceil(timeoutMs / 500));

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const state = await getLinkedInAuthState(page);
    if (state === "authenticated") {
      await gotoJobPage(page, url);
      const unlockedState = await waitForLinkedInAuthResolution(page, 2_000);
      if (unlockedState === "authenticated") {
        logger.info(
          {
            event: "linkedin.auth.manual_recovery.succeeded",
            url: page.url(),
          },
          "LinkedIn authentication recovered after manual intervention",
        );
        return true;
      }
    }

    await page.waitForTimeout(500);
  }

  logger.info(
    {
      event: "linkedin.auth.manual_recovery.timed_out",
      url: page.url(),
      timeoutMs,
    },
    "Manual LinkedIn authentication recovery timed out",
  );
  return false;
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
    const titleParts = parseLinkedInPageTitle(await page.title().catch(() => null));
    await expandLinkedInAboutSection(page);
    const aboutText =
      (await extractSectionText(page, LINKEDIN_ABOUT_TEXT_SELECTORS)) ??
      (await extractSectionText(page, ["main", "article", "body"]));
    const aboutCompanyText = await extractSectionText(page, LINKEDIN_ABOUT_COMPANY_SELECTORS);
    const aboutPosition = parseLinkedInLabeledField(aboutText, "Position");
    const aboutLocation = parseLinkedInLabeledField(aboutText, "Location");

    const rawTitle =
      (await getTextBySelectors(page, LINKEDIN_TITLE_SELECTORS)) ??
      aboutPosition ??
      titleParts.title;
    const companyAriaLabel = await getAttributeBySelectors(
      page,
      LINKEDIN_COMPANY_ARIA_SELECTORS,
      "aria-label",
    );
    const company =
      (await getTextBySelectors(page, LINKEDIN_COMPANY_SELECTORS)) ??
      parseLinkedInCompanyAriaLabel(companyAriaLabel) ??
      parseLinkedInAboutCompanyName(aboutCompanyText) ??
      titleParts.company;
    const companyLogoUrl = await getAttributeBySelectors(
      page,
      LINKEDIN_COMPANY_LOGO_SELECTORS,
      "src",
    );
    const companyLinkedinUrl = await getAttributeBySelectors(
      page,
      LINKEDIN_COMPANY_URL_SELECTORS,
      "href",
    );

    const badgeTexts = flattenTextLines(await getTextsBySelectors(page, LINKEDIN_BADGE_SELECTORS));
    const workplaceType = parseLinkedInWorkplaceType(badgeTexts);
    const inferredBadgeLocation =
      aboutLocation ??
      badgeTexts.find((value) => /\b(remote|hybrid|onsite|on-site)\b/i.test(value)) ??
      inferLocationFromBodyText(pageBodyText) ??
      titleParts.location;
    const rawLocation =
      (await getTextBySelectors(page, LINKEDIN_LOCATION_SELECTORS)) ?? inferredBadgeLocation ?? null;
    const sanitizedRawLocation = sanitizeLinkedInLocation(rawLocation);
    const fallbackTitleLocation = sanitizeLinkedInLocation(titleParts.location);
    const location =
      isGenericLinkedInWorkplaceLocation(sanitizedRawLocation) &&
      fallbackTitleLocation &&
      !isGenericLinkedInWorkplaceLocation(fallbackTitleLocation)
        ? fallbackTitleLocation
        : sanitizedRawLocation;
    const title = cleanLinkedInTitle(rawTitle, location) ?? aboutPosition ?? titleParts.title;

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

    const aboutSections = parseLinkedInAboutSections(aboutText);

    const requirementsText =
      aboutSections.requirementsText ??
      (await extractSectionText(page, [
      "[class*='qualification']",
      "[class*='requirement']",
      "[data-testid='job-details-how-you-match-card']",
    ]));

    const benefitsText =
      aboutSections.benefitsText ??
      (await extractSectionText(page, [
      "[class*='benefit']",
      "[class*='perk']",
    ]));
    const descriptionText = aboutSections.descriptionText ?? aboutText;

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
      : bodyLower.includes("company website") ||
          bodyLower.includes("company site") ||
          bodyLower.includes("external apply")
        ? "external"
        : "unknown";

    const focusedRawText = compactText(
      [
        title ? `Title: ${title}` : null,
        company ? `Company: ${company}` : null,
        companyLogoUrl ? `Company Logo URL: ${companyLogoUrl}` : null,
        companyLinkedinUrl ? `Company LinkedIn URL: ${companyLinkedinUrl}` : null,
        location ? `Location: ${location}` : null,
        workplaceType ? `Workplace Type: ${workplaceType}` : null,
        `Application Type: ${applicationType}`,
        badgeTexts.length > 0 ? `Badges:\n${badgeTexts.join("\n")}` : null,
        descriptionText ? `Description:\n${descriptionText}` : null,
        requirementsText ? `Requirements:\n${requirementsText}` : null,
        benefitsText ? `Benefits:\n${benefitsText}` : null,
        aboutCompanyText ? `About Company:\n${aboutCompanyText}` : null,
      ]
        .filter(Boolean)
        .join("\n\n"),
    );

    return {
      rawText: focusedRawText,
      title,
      company,
      companyLogoUrl,
      companyLinkedinUrl,
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
  logger.info(
    {
      event: "linkedin.auth.state",
      state: initialState,
      url: page.url(),
      title: await page.title().catch(() => ""),
    },
    "LinkedIn auth state detected",
  );
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

  if (!usernameInput || !passwordInput) {
    const recovered = await waitForManualLinkedInIntervention(page, url);
    if (recovered) {
      return;
    }

    const artifacts = await capturePageArtifacts(page, "linkedin-login-form-not-found");
    throw new AppError({
      message: "LinkedIn login form was not detected.",
      phase: "linkedin_auth",
      code: "LINKEDIN_LOGIN_FORM_NOT_FOUND",
      details: {
        url: page.url(),
        title: await page.title(),
        ...artifacts,
      },
    });
  }

  const submitButton = await requireLocator(
    page,
    LINKEDIN_SUBMIT_SELECTORS,
    async () => {
      const artifacts = await capturePageArtifacts(page, "linkedin-login-submit-not-found");
      return new AppError({
        message: "LinkedIn sign-in submit button was not detected.",
        phase: "linkedin_auth",
        code: "LINKEDIN_LOGIN_SUBMIT_NOT_FOUND",
        details: {
          url: page.url(),
          title: await page.title(),
          ...artifacts,
        },
      });
    },
  );

  logger.info({ event: "linkedin.auth.submit", url: page.url() }, "Submitting LinkedIn credentials");
  await usernameInput.fill(env.LINKEDIN_USERNAME);
  await passwordInput.fill(env.LINKEDIN_PASSWORD);
  await submitButton.click();
  const postSubmitState = await waitForLinkedInAuthResolution(page);

  if (postSubmitState === "challenge") {
    const recovered = await waitForManualLinkedInIntervention(page, url);
    if (recovered) {
      return;
    }

    const artifacts = await capturePageArtifacts(page, "linkedin-auth-challenge-post-submit");
    throw new AppError({
      message: "LinkedIn login reached a verification challenge. Manual verification is required before automation can continue.",
      phase: "linkedin_auth",
      code: "LINKEDIN_AUTHENTICATION_CHALLENGE",
      details: {
        url: page.url(),
        title: await page.title(),
        ...artifacts,
      },
    });
  }

  await gotoJobPage(page, url);

  const finalState = await waitForLinkedInAuthResolution(page, 5_000);
  if (finalState === "challenge") {
    const recovered = await waitForManualLinkedInIntervention(page, url);
    if (recovered) {
      return;
    }

    const artifacts = await capturePageArtifacts(page, "linkedin-auth-challenge-after-login");
    throw new AppError({
      message: "LinkedIn redirected to a verification challenge after login. Manual verification is required before automation can continue.",
      phase: "linkedin_auth",
      code: "LINKEDIN_AUTHENTICATION_CHALLENGE",
      details: {
        url: page.url(),
        title: await page.title(),
        ...artifacts,
      },
    });
  }

  if (finalState !== "authenticated") {
    const recovered = await waitForManualLinkedInIntervention(page, url);
    if (recovered) {
      return;
    }

    const artifacts = await capturePageArtifacts(page, "linkedin-auth-not-unlocked");
    throw new AppError({
      message: "LinkedIn authentication did not unlock the job page. The session may need manual verification.",
      phase: "linkedin_auth",
      code: "LINKEDIN_AUTHENTICATION_FAILED",
      details: {
        url: page.url(),
        title: await page.title(),
        ...artifacts,
      },
    });
  }
}
