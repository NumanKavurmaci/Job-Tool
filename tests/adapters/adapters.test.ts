import { afterEach, describe, expect, it, vi } from "vitest";
import { GenericAdapter } from "../../src/adapters/GenericAdapter.js";
import { GreenhouseAdapter } from "../../src/adapters/GreenhouseAdapter.js";
import { LeverAdapter } from "../../src/adapters/LeverAdapter.js";
import {
  linkedInAboutOnlyTitleAndLocationFixture,
  linkedInAlreadyAppliedFixture,
  linkedInCompanyFallbackFixture,
  linkedInCrossingHurdlesFixture,
  linkedInExternalApplyFixture,
  linkedInRemoteBadgeFixture,
} from "../fixtures/linkedin.js";
import { createMockPage, type MockPageContext, type MockPageState } from "../utils/fakePage.js";

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("../../src/config/env.js");
});

describe("GenericAdapter", () => {
  it("handles any url and extracts structured content", async () => {
    const page = createMockPage({
      currentUrl: "https://company.example.com/jobs/role",
      title: "Generic Fallback Title",
      selectors: {
        h1: { text: "Software Engineer" },
        "[data-testid='company-name']": { text: "Acme" },
        "[data-testid='job-location']": { text: "Remote" },
        "a[href*='apply']": { attributes: { href: "https://company.example.com/apply" } },
        main: { text: "Job description" },
        "[data-testid='requirements']": { text: "3+ years experience" },
        "[data-testid='benefits']": { text: "Health insurance" },
        body: { text: "Full raw body" },
      },
    });

    const adapter = new GenericAdapter();

    expect(adapter.canHandle("https://anything.example.com")).toBe(true);
    await expect(adapter.extract(page as never, page.url())).resolves.toEqual({
      rawText: "Full raw body",
      title: "Software Engineer",
      company: "Acme",
      companyLogoUrl: null,
      companyLinkedinUrl: null,
      location: "Remote",
      platform: "generic",
      applicationType: "unknown",
      applyUrl: "https://company.example.com/apply",
      currentUrl: "https://company.example.com/jobs/role",
      descriptionText: "Job description",
      requirementsText: "3+ years experience",
      benefitsText: "Health insurance",
    });
  });

  it("falls back to current url when no apply link exists", async () => {
    const page = createMockPage({
      currentUrl: "https://company.example.com/jobs/role",
      title: "Page Title",
      selectors: {
        body: { text: "Raw body" },
      },
    });

    const result = await new GenericAdapter().extract(page as never, page.url());

    expect(result.title).toBe("Page Title");
    expect(result.applyUrl).toBe("https://company.example.com/jobs/role");
    expect(result.applicationType).toBe("unknown");
  });

  it("extracts a linkedin-style job page through the generic fallback", async () => {
    const page = createMockPage({
      currentUrl: "https://www.linkedin.com/jobs/view/1234567890/",
      title: "Senior Backend Engineer | LinkedIn",
      selectors: {
        h1: { text: "Senior Backend Engineer" },
        "[class*='company']": { text: "LinkedIn Company" },
        "[class*='location']": { text: "Istanbul, Turkey" },
        body: {
          text: [
            "Senior Backend Engineer",
            "LinkedIn Company",
            "Istanbul, Turkey",
            "About the job",
            "Build backend services for hiring workflows.",
            "Qualifications",
            "5+ years of backend experience.",
            "Benefits",
            "Private health insurance.",
          ].join("\n"),
        },
      },
    });

    const result = await new GenericAdapter().extract(page as never, page.url());

    expect(result.platform).toBe("generic");
    expect(result.applicationType).toBe("unknown");
    expect(result.currentUrl).toBe("https://www.linkedin.com/jobs/view/1234567890/");
    expect(result.applyUrl).toBe("https://www.linkedin.com/jobs/view/1234567890/");
    expect(result.title).toBe("Senior Backend Engineer");
    expect(result.company).toBe("LinkedIn Company");
    expect(result.companyLogoUrl).toBeNull();
    expect(result.companyLinkedinUrl).toBeNull();
    expect(result.location).toBe("Istanbul, Turkey");
    expect(result.descriptionText).toContain("About the job");
    expect(result.rawText).toContain("Qualifications");
    expect(result.rawText).toContain("Benefits");
  });
});

describe("LinkedInAdapter", () => {
  it("matches linkedin urls and extracts structured linkedin fields", async () => {
    const { LinkedInAdapter } = await import("../../src/adapters/LinkedInAdapter.js");
    const adapter = new LinkedInAdapter();
    const page = createMockPage({
      currentUrl: "https://www.linkedin.com/jobs/view/1234567890/",
      title: "Senior Backend Engineer | LinkedIn",
      selectors: {
        ".job-details-jobs-unified-top-card__job-title": { text: "Senior Backend Engineer" },
        ".job-details-jobs-unified-top-card__company-name": { text: "Acme" },
        ".job-details-jobs-unified-top-card__bullet": { text: "Remote" },
        "button.jobs-apply-button": { text: "Easy Apply" },
        ".jobs-description-content__text": { text: "Build product features." },
        "[class*='qualification']": { text: "5+ years with TypeScript." },
        "[class*='benefit']": { text: "Health insurance." },
        body: { text: "Senior Backend Engineer\nAcme\nRemote\nEasy Apply\nBuild product features." },
      },
    });

    expect(adapter.canHandle(page.url())).toBe(true);

    const result = await adapter.extract(page as never, page.url());

    expect(result.platform).toBe("linkedin");
    expect(result.title).toBe("Senior Backend Engineer");
    expect(result.company).toBe("Acme");
    expect(result.companyLogoUrl).toBeNull();
    expect(result.location).toBe("Remote");
    expect(result.applicationType).toBe("easy_apply");
    expect(result.descriptionText).toBe("Build product features.");
    expect(result.rawText).toContain("Title: Senior Backend Engineer");
    expect(result.rawText).toContain("Description:");
    expect(result.rawText).not.toContain("LinkedIn Sign in");
  });

  it("logs in before extracting when linkedin shows a sign-in wall", async () => {
    vi.doMock("../../src/config/env.js", () => ({
      env: {
        LINKEDIN_USERNAME: "user@example.com",
        LINKEDIN_PASSWORD: "secret",
        LINKEDIN_MANUAL_AUTH_WINDOW_MS: 10_000,
      },
    }));

    const { LinkedInAdapter } = await import("../../src/adapters/LinkedInAdapter.js");
    let isAuthenticated = false;
    const jobUrl = "https://www.linkedin.com/jobs/view/1234567890/";
    const page = createMockPage({
      currentUrl: jobUrl,
      routes: {
        [jobUrl]: (): MockPageState =>
          isAuthenticated
            ? {
                currentUrl: jobUrl,
                title: "Backend Engineer | LinkedIn",
                selectors: {
                  ".job-details-jobs-unified-top-card__job-title": { text: "Backend Engineer" },
                  ".job-details-jobs-unified-top-card__company-name": { text: "Acme" },
                  ".job-details-jobs-unified-top-card__bullet": { text: "Berlin" },
                  "button.jobs-apply-button": { text: "Easy Apply" },
                  ".jobs-description-content__text": { text: "Build APIs." },
                  body: { text: "Backend Engineer\nAcme\nBerlin\nEasy Apply\nBuild APIs." },
                },
              }
            : {
                currentUrl: jobUrl,
                title: "Sign in | LinkedIn",
                selectors: {
                  body: { text: "LinkedIn Sign in to continue" },
                },
              },
        "https://www.linkedin.com/login": {
          currentUrl: "https://www.linkedin.com/login",
          title: "Login | LinkedIn",
          selectors: {
            "input[name='session_key']": { text: "" },
            "input[name='session_password']": { text: "" },
            "button[type='submit']": { text: "Sign in" },
            body: { text: "LinkedIn Sign in" },
          },
        },
      },
      onClick(selector, context) {
        if (
          selector === "button[type='submit']"
          && context.filledValues["input[name='session_key']"] === "user@example.com"
          && context.filledValues["input[name='session_password']"] === "secret"
        ) {
          isAuthenticated = true;
        }
      },
      onFill(selector, value, context) {
        context.filledValues[selector] = value;
      },
    });

    const result = await new LinkedInAdapter().extract(page as never, jobUrl);
    expect(result.platform).toBe("linkedin");
    expect(result.title).toBe("Backend Engineer");
    expect(result.companyLogoUrl).toBeNull();
    expect(result.companyLinkedinUrl).toBeNull();
    expect(result.applicationType).toBe("easy_apply");
  });

  it("accepts alternate linkedin login field selectors", async () => {
    vi.doMock("../../src/config/env.js", () => ({
      env: {
        LINKEDIN_USERNAME: "user@example.com",
        LINKEDIN_PASSWORD: "secret",
        LINKEDIN_MANUAL_AUTH_WINDOW_MS: 10_000,
      },
    }));

    const { LinkedInAdapter } = await import("../../src/adapters/LinkedInAdapter.js");
    let isAuthenticated = false;
    const jobUrl = "https://www.linkedin.com/jobs/view/987654321/";
    const page = createMockPage({
      currentUrl: jobUrl,
      routes: {
        [jobUrl]: (): MockPageState =>
          isAuthenticated
            ? {
                currentUrl: jobUrl,
                title: "Backend Engineer | LinkedIn",
                selectors: {
                  ".job-details-jobs-unified-top-card__job-title": { text: "Backend Engineer" },
                  ".job-details-jobs-unified-top-card__company-name": { text: "Acme" },
                  ".job-details-jobs-unified-top-card__bullet": { text: "Remote" },
                  "button.jobs-apply-button": { text: "Easy Apply" },
                  ".jobs-description-content__text": { text: "Build APIs." },
                  body: { text: "Backend Engineer\nAcme\nRemote\nEasy Apply\nBuild APIs." },
                },
              }
            : {
                currentUrl: jobUrl,
                title: "Sign in | LinkedIn",
                selectors: {
                  body: { text: "LinkedIn Sign in to continue" },
                },
              },
        "https://www.linkedin.com/login": {
          currentUrl: "https://www.linkedin.com/login",
          title: "Login | LinkedIn",
          selectors: {
            "input#username": { text: "" },
            "input#password": { text: "" },
            "button[type='submit']": { text: "Sign in" },
            body: { text: "LinkedIn Sign in" },
          },
        },
      },
      onClick(selector, context) {
        if (
          selector === "button[type='submit']"
          && context.filledValues["input#username"] === "user@example.com"
          && context.filledValues["input#password"] === "secret"
        ) {
          isAuthenticated = true;
        }
      },
      onFill(selector, value, context) {
        context.filledValues[selector] = value;
      },
    });

    const result = await new LinkedInAdapter().extract(page as never, jobUrl);
    expect(result.platform).toBe("linkedin");
    expect(result.title).toBe("Backend Engineer");
    expect(result.companyLogoUrl).toBeNull();
    expect(result.companyLinkedinUrl).toBeNull();
  });

  it("fails clearly when linkedin still requires authentication and no credentials exist", async () => {
    vi.doMock("../../src/config/env.js", () => ({
      env: {
        LINKEDIN_USERNAME: undefined,
        LINKEDIN_PASSWORD: undefined,
        LINKEDIN_MANUAL_AUTH_WINDOW_MS: 10_000,
      },
    }));

    const { LinkedInAdapter } = await import("../../src/adapters/LinkedInAdapter.js");
    const jobUrl = "https://www.linkedin.com/jobs/view/1234567890/";
    const page = createMockPage({
      currentUrl: jobUrl,
      routes: {
        [jobUrl]: {
          currentUrl: jobUrl,
          title: "Sign in | LinkedIn",
          selectors: {
            body: { text: "LinkedIn Sign in to continue" },
          },
        },
      },
    });

    await expect(new LinkedInAdapter().extract(page as never, jobUrl)).rejects.toThrow(
      "LinkedIn job pages require authentication",
    );
  });

  it("reuses an already authenticated linkedin session without requiring credentials", async () => {
    vi.doMock("../../src/config/env.js", () => ({
      env: {
        LINKEDIN_USERNAME: undefined,
        LINKEDIN_PASSWORD: undefined,
        LINKEDIN_MANUAL_AUTH_WINDOW_MS: 10_000,
      },
    }));

    const { LinkedInAdapter } = await import("../../src/adapters/LinkedInAdapter.js");
    const jobUrl = "https://www.linkedin.com/jobs/view/1234567890/";
    const page = createMockPage({
      currentUrl: jobUrl,
      title: "Backend Engineer | LinkedIn",
      selectors: {
        ".jobs-unified-top-card": { text: "Signed in card" },
        ".job-details-jobs-unified-top-card__job-title": { text: "Backend Engineer" },
        ".job-details-jobs-unified-top-card__company-name": { text: "Acme" },
        ".job-details-jobs-unified-top-card__bullet": { text: "Remote" },
        "button.jobs-apply-button": { text: "Easy Apply" },
        ".jobs-description-content__text": { text: "Build APIs." },
        body: { text: "Backend Engineer\nAcme\nRemote\nEasy Apply\nBuild APIs." },
      },
    });

    const result = await new LinkedInAdapter().extract(page as never, jobUrl);

    expect(result.platform).toBe("linkedin");
    expect(result.title).toBe("Backend Engineer");
    expect(result.companyLogoUrl).toBeNull();
    expect(result.companyLinkedinUrl).toBeNull();
  });

  it("treats linkedin feed redirects as authenticated when there is no sign-in wall", async () => {
    vi.doMock("../../src/config/env.js", () => ({
      env: {
        LINKEDIN_USERNAME: "user@example.com",
        LINKEDIN_PASSWORD: "secret",
        LINKEDIN_MANUAL_AUTH_WINDOW_MS: 10_000,
      },
    }));

    const { LinkedInAdapter } = await import("../../src/adapters/LinkedInAdapter.js");
    const jobUrl = "https://www.linkedin.com/jobs/view/1234567890/";
    const page = createMockPage({
      currentUrl: jobUrl,
      routes: {
        [jobUrl]: {
          currentUrl: "https://www.linkedin.com/feed/",
          title: "Feed | LinkedIn",
          selectors: {
            body: { text: "Welcome back to LinkedIn Feed" },
          },
        },
      },
    });

    await expect(new LinkedInAdapter().extract(page as never, jobUrl)).resolves.toMatchObject({
      platform: "linkedin",
      currentUrl: "https://www.linkedin.com/feed/",
      applicationType: "unknown",
    });
  });

  it("fails with a specific challenge error when linkedin redirects to security verification", async () => {
    vi.doMock("../../src/config/env.js", () => ({
      env: {
        LINKEDIN_USERNAME: "user@example.com",
        LINKEDIN_PASSWORD: "secret",
        LINKEDIN_MANUAL_AUTH_WINDOW_MS: 10_000,
      },
    }));

    const { LinkedInAdapter } = await import("../../src/adapters/LinkedInAdapter.js");
    const jobUrl = "https://www.linkedin.com/jobs/view/1234567890/";
    const page = createMockPage({
      currentUrl: jobUrl,
      routes: {
        [jobUrl]: {
          currentUrl: jobUrl,
          title: "Sign in | LinkedIn",
          selectors: {
            body: { text: "LinkedIn Sign in to continue" },
          },
        },
        "https://www.linkedin.com/login": {
          currentUrl: "https://www.linkedin.com/login",
          title: "Login | LinkedIn",
          selectors: {
            "input[name='session_key']": { text: "" },
            "input[name='session_password']": { text: "" },
            "button[type='submit']": { text: "Sign in" },
            body: { text: "LinkedIn Sign in" },
          },
        },
      },
      onClick(selector, context) {
        if (selector === "button[type='submit']") {
          context.setState({
            currentUrl: "https://www.linkedin.com/checkpoint/challenge/abc",
            title: "Security Verification | LinkedIn",
            selectors: {
              body: { text: "Security verification checkpoint" },
            },
          });
        }
      },
      onFill(selector, value, context) {
        context.filledValues[selector] = value;
      },
    });

    await expect(new LinkedInAdapter().extract(page as never, jobUrl)).rejects.toMatchObject({
      name: "AppError",
      phase: "linkedin_auth",
      code: "LINKEDIN_AUTHENTICATION_CHALLENGE",
    });
  });

  it("allows the configured manual recovery window on auth challenge and resumes when the user logs in", async () => {
    vi.doMock("../../src/config/env.js", () => ({
      env: {
        LINKEDIN_USERNAME: "user@example.com",
        LINKEDIN_PASSWORD: "secret",
        LINKEDIN_MANUAL_AUTH_WINDOW_MS: 10_000,
      },
    }));

    const { LinkedInAdapter } = await import("../../src/adapters/LinkedInAdapter.js");
    const jobUrl = "https://www.linkedin.com/jobs/view/1234567890/";
    let waitCount = 0;
    let manuallyAuthenticated = false;
    const page = createMockPage({
      currentUrl: jobUrl,
      routes: {
        [jobUrl]: (_context: MockPageContext): MockPageState => {
          if (manuallyAuthenticated) {
            return {
              currentUrl: jobUrl,
              title: "Backend Engineer | LinkedIn",
              selectors: {
                ".jobs-unified-top-card": { text: "Signed in card" },
                ".job-details-jobs-unified-top-card__job-title": { text: "Backend Engineer" },
                ".job-details-jobs-unified-top-card__company-name": { text: "Acme" },
                ".job-details-jobs-unified-top-card__bullet": { text: "Remote" },
                "button.jobs-apply-button": { text: "Easy Apply" },
                ".jobs-description-content__text": { text: "Build APIs." },
                body: { text: "Backend Engineer\nAcme\nRemote\nEasy Apply\nBuild APIs." },
              },
            };
          }

          return {
            currentUrl: jobUrl,
            title: "Sign in | LinkedIn",
            selectors: {
              body: { text: "LinkedIn Sign in to continue" },
            },
          };
        },
        "https://www.linkedin.com/login": {
          currentUrl: "https://www.linkedin.com/login",
          title: "Login | LinkedIn",
          selectors: {
            "input[name='session_key']": { text: "" },
            "input[name='session_password']": { text: "" },
            "button[type='submit']": { text: "Sign in" },
            body: { text: "LinkedIn Sign in" },
          },
        },
      },
      onClick(selector, context) {
        if (selector === "button[type='submit']") {
          context.setState({
            currentUrl: "https://www.linkedin.com/checkpoint/challenge/abc",
            title: "Security Verification | LinkedIn",
            selectors: {
              body: { text: "Security verification checkpoint" },
            },
          });
        }
      },
      onFill(selector, value, context) {
        context.filledValues[selector] = value;
      },
      onWaitForTimeout(_timeoutMs, context) {
        waitCount += 1;
        if (waitCount === 1) {
          manuallyAuthenticated = true;
          context.setState({
            currentUrl: jobUrl,
            title: "Backend Engineer | LinkedIn",
            selectors: {
              ".jobs-unified-top-card": { text: "Signed in card" },
              ".job-details-jobs-unified-top-card__job-title": { text: "Backend Engineer" },
              ".job-details-jobs-unified-top-card__company-name": { text: "Acme" },
              ".job-details-jobs-unified-top-card__bullet": { text: "Remote" },
              "button.jobs-apply-button": { text: "Easy Apply" },
              ".jobs-description-content__text": { text: "Build APIs." },
              body: { text: "Backend Engineer\nAcme\nRemote\nEasy Apply\nBuild APIs." },
            },
          });
        }
      },
    });

    const result = await new LinkedInAdapter().extract(page as never, jobUrl);

    expect(result.platform).toBe("linkedin");
    expect(result.title).toBe("Backend Engineer");
    expect(waitCount).toBeGreaterThanOrEqual(1);
  });

  it("fails after the configured manual recovery window when the user does not intervene", async () => {
    vi.doMock("../../src/config/env.js", () => ({
      env: {
        LINKEDIN_USERNAME: "user@example.com",
        LINKEDIN_PASSWORD: "secret",
        LINKEDIN_MANUAL_AUTH_WINDOW_MS: 10_000,
      },
    }));

    const { LinkedInAdapter } = await import("../../src/adapters/LinkedInAdapter.js");
    const jobUrl = "https://www.linkedin.com/jobs/view/1234567890/";
    let waitCount = 0;
    const page = createMockPage({
      currentUrl: jobUrl,
      routes: {
        [jobUrl]: {
          currentUrl: jobUrl,
          title: "Sign in | LinkedIn",
          selectors: {
            body: { text: "LinkedIn Sign in to continue" },
          },
        },
        "https://www.linkedin.com/login": {
          currentUrl: "https://www.linkedin.com/login",
          title: "Login | LinkedIn",
          selectors: {
            "input[name='session_key']": { text: "" },
            "input[name='session_password']": { text: "" },
            "button[type='submit']": { text: "Sign in" },
            body: { text: "LinkedIn Sign in" },
          },
        },
      },
      onClick(selector, context) {
        if (selector === "button[type='submit']") {
          context.setState({
            currentUrl: "https://www.linkedin.com/checkpoint/challenge/abc",
            title: "Security Verification | LinkedIn",
            selectors: {
              body: { text: "Security verification checkpoint" },
            },
          });
        }
      },
      onFill(selector, value, context) {
        context.filledValues[selector] = value;
      },
      onWaitForTimeout() {
        waitCount += 1;
      },
    });

    await expect(new LinkedInAdapter().extract(page as never, jobUrl)).rejects.toMatchObject({
      name: "AppError",
      phase: "linkedin_auth",
      code: "LINKEDIN_AUTHENTICATION_CHALLENGE",
    });
    expect(waitCount).toBeGreaterThanOrEqual(20);
  });

  it("marks linkedin external-apply pages as external", async () => {
    const { LinkedInAdapter } = await import("../../src/adapters/LinkedInAdapter.js");
    const page = createMockPage({
      currentUrl: "https://www.linkedin.com/jobs/view/1234567890/",
      title: "Senior Backend Engineer | LinkedIn",
      selectors: {
        ".job-details-jobs-unified-top-card__job-title": { text: "Senior Backend Engineer" },
        ".job-details-jobs-unified-top-card__company-name": { text: "Acme" },
        ".job-details-jobs-unified-top-card__bullet": { text: "Remote" },
        body: { text: "Senior Backend Engineer\nApply on company website\nBuild product features." },
      },
    });

    const result = await new LinkedInAdapter().extract(page as never, page.url());
    expect(result.applicationType).toBe("external");
  });

  it("extracts linkedin about-the-job content without relying on noisy full-page body text", async () => {
    const { LinkedInAdapter } = await import("../../src/adapters/LinkedInAdapter.js");
    let expanded = false;
    const page = createMockPage({
      currentUrl: "https://www.linkedin.com/jobs/view/4386852533/",
      title: linkedInCrossingHurdlesFixture.pageTitle,
      selectors: {
        "[data-testid='expandable-text-button']": { text: "more" },
        "p[data-test-id='job-title']": { text: linkedInCrossingHurdlesFixture.titleText },
        "[data-testid='expandable-text-box']": { text: linkedInCrossingHurdlesFixture.aboutCollapsed },
        "a[href*='linkedin.com/jobs/view'] span": { text: linkedInCrossingHurdlesFixture.badges },
        "a[href*='linkedin.com/company/'] img[alt*='Company logo']": {
          attributes: { src: linkedInCrossingHurdlesFixture.companyLogoUrl },
        },
        "a[href*='linkedin.com/company/'][componentkey]": {
          attributes: { href: linkedInCrossingHurdlesFixture.companyLinkedinUrl },
        },
        body: { text: linkedInCrossingHurdlesFixture.noisyBody },
        "[data-testid='about-company-module']": {
          text: linkedInCrossingHurdlesFixture.aboutCompanyText,
        },
      },
      onClick(selector) {
        if (selector === "[data-testid='expandable-text-button']") {
          expanded = true;
        }
      },
    });

    const result = await new LinkedInAdapter().extract(page as never, page.url());

    expect(expanded).toBe(true);
    expect(result.title).toBe("Software Engineer (Fullstack)");
    expect(result.company).toBe("Crossing Hurdles");
    expect(result.companyLogoUrl).toBe(linkedInCrossingHurdlesFixture.companyLogoUrl);
    expect(result.companyLinkedinUrl).toBe("https://www.linkedin.com/company/crossing-hurdles/life/");
    expect(result.location).toBe("Remote");
    expect(result.applicationType).toBe("unknown");
    expect(result.descriptionText).toContain("Fullstack Developer (Python/React)");
    expect(result.descriptionText).toContain("Build and maintain scalable backend APIs");
    expect(result.requirementsText).toContain("React");
    expect(result.rawText).toContain("Badges:");
    expect(result.rawText).toContain("Contract");
    expect(result.rawText).toContain("About Company:");
    expect(result.rawText).toContain("Staffing and Recruiting");
    expect(result.rawText).toContain("Company Logo URL:");
  });

  it("falls back to about-company and company logo selectors when top-card company is missing", async () => {
    const { LinkedInAdapter } = await import("../../src/adapters/LinkedInAdapter.js");
    const page = createMockPage({
      currentUrl: "https://www.linkedin.com/jobs/view/4378935392/",
      title: linkedInCompanyFallbackFixture.pageTitle,
      selectors: {
        "p[data-test-id='job-title']": { text: linkedInCompanyFallbackFixture.titleText },
        ".job-details-jobs-unified-top-card__bullet": { text: "Remote" },
        "a[href*='linkedin.com/company/'][componentkey] p": {
          text: linkedInCompanyFallbackFixture.companyName,
        },
        "a[href*='linkedin.com/company/'][componentkey]": {
          attributes: { href: linkedInCompanyFallbackFixture.companyLinkedinUrl },
        },
        "a[href*='linkedin.com/company/'] img[alt*='Company logo']": {
          attributes: { src: linkedInCompanyFallbackFixture.companyLogoUrl },
        },
        "[data-testid='about-company-module']": {
          text: linkedInCompanyFallbackFixture.aboutCompanyText,
        },
        "[data-testid='expandable-text-box']": { text: "Build React commerce experiences." },
        body: {
          text: [
            linkedInCompanyFallbackFixture.titleText,
            "Remote",
            linkedInCompanyFallbackFixture.companyName,
          ].join("\n"),
        },
      },
    });

    const result = await new LinkedInAdapter().extract(page as never, page.url());

    expect(result.company).toBe("Ticimax");
    expect(result.companyLogoUrl).toBe(linkedInCompanyFallbackFixture.companyLogoUrl);
    expect(result.companyLinkedinUrl).toBe("https://www.linkedin.com/company/ticimax/life/");
    expect(result.rawText).toContain("Company: Ticimax");
  });

  it("falls back to about-the-job position and location labels when top-card title is missing", async () => {
    const { LinkedInAdapter } = await import("../../src/adapters/LinkedInAdapter.js");
    const page = createMockPage({
      currentUrl: "https://www.linkedin.com/jobs/view/4378935392/",
      title: linkedInAboutOnlyTitleAndLocationFixture.pageTitle,
      selectors: {
        ".job-details-jobs-unified-top-card__company-name": {
          text: linkedInAboutOnlyTitleAndLocationFixture.companyName,
        },
        "a[href*='linkedin.com/company/']": {
          attributes: { href: linkedInAboutOnlyTitleAndLocationFixture.companyLinkedinUrl },
        },
        "a[href*='linkedin.com/company/'] img[alt*='Company logo']": {
          attributes: { src: linkedInAboutOnlyTitleAndLocationFixture.companyLogoUrl },
        },
        "[data-testid='expandable-text-box']": {
          text: linkedInAboutOnlyTitleAndLocationFixture.aboutText,
        },
        "[data-testid='about-company-module']": {
          text: linkedInAboutOnlyTitleAndLocationFixture.aboutCompanyText,
        },
        body: {
          text: [
            linkedInAboutOnlyTitleAndLocationFixture.companyName,
            linkedInAboutOnlyTitleAndLocationFixture.topMetaLine,
            linkedInAboutOnlyTitleAndLocationFixture.aboutText,
          ].join("\n"),
        },
      },
    });

    const result = await new LinkedInAdapter().extract(page as never, page.url());

    expect(result.title).toBe("System Engineer");
    expect(result.location).toBe("Kozyatağı Allianz Tower (Hybrid)");
    expect(result.company).toBe("Ticimax");
    expect(result.companyLogoUrl).toBe(linkedInAboutOnlyTitleAndLocationFixture.companyLogoUrl);
    expect(result.companyLinkedinUrl).toBe("https://www.linkedin.com/company/ticimax/life/");
    expect(result.rawText).toContain("Title: System Engineer");
    expect(result.rawText).toContain("Location: Kozyatağı Allianz Tower (Hybrid)");
  });

  it("extracts workplace type from linkedin preference badges and sanitizes noisy location meta", async () => {
    const { LinkedInAdapter } = await import("../../src/adapters/LinkedInAdapter.js");
    const page = createMockPage({
      currentUrl: "https://www.linkedin.com/jobs/view/4389593314/",
      title: linkedInRemoteBadgeFixture.pageTitle,
      selectors: {
        ".job-details-jobs-unified-top-card__job-title": {
          text: linkedInRemoteBadgeFixture.titleText,
        },
        ".job-details-jobs-unified-top-card__company-name": {
          text: linkedInRemoteBadgeFixture.companyName,
        },
        ".job-details-jobs-unified-top-card__bullet": {
          text: linkedInRemoteBadgeFixture.locationMetaLine,
        },
        ".job-details-fit-level-preferences button": {
          text: linkedInRemoteBadgeFixture.badgeTexts,
        },
        "a[href*='linkedin.com/company/']": {
          attributes: { href: linkedInRemoteBadgeFixture.companyLinkedinUrl },
        },
        "a[href*='linkedin.com/company/'] img[alt*='Company logo']": {
          attributes: { src: linkedInRemoteBadgeFixture.companyLogoUrl },
        },
        "[data-testid='expandable-text-box']": {
          text: linkedInRemoteBadgeFixture.aboutText,
        },
        body: {
          text: [
            linkedInRemoteBadgeFixture.titleText,
            linkedInRemoteBadgeFixture.companyName,
            linkedInRemoteBadgeFixture.locationMetaLine,
            linkedInRemoteBadgeFixture.badgeTexts,
            linkedInRemoteBadgeFixture.aboutText,
          ].join("\n"),
        },
      },
    });

    const result = await new LinkedInAdapter().extract(page as never, page.url());

    expect(result.title).toBe("Full Stack Engineer");
    expect(result.company).toBe("Wide and Wise");
    expect(result.location).toBe("Türkiye");
    expect(result.rawText).toContain("Workplace Type: remote");
    expect(result.rawText).toContain("Badges:");
    expect(result.rawText).toContain("Remote");
  });

  it("extracts title, company, linkedin company url, logo, and remote workplace data from an already-applied linkedin job", async () => {
    const { LinkedInAdapter } = await import("../../src/adapters/LinkedInAdapter.js");
    const page = createMockPage({
      currentUrl: "https://www.linkedin.com/jobs/view/4389593314/",
      title: linkedInAlreadyAppliedFixture.pageTitle,
      selectors: {
        ".job-details-jobs-unified-top-card__job-title": {
          text: linkedInAlreadyAppliedFixture.titleText,
        },
        ".job-details-jobs-unified-top-card__company-name": {
          text: linkedInAlreadyAppliedFixture.companyName,
          attributes: { href: linkedInAlreadyAppliedFixture.companyLinkedinUrl },
        },
        ".job-details-jobs-unified-top-card__bullet": {
          text: linkedInAlreadyAppliedFixture.locationMetaLine,
        },
        ".job-details-fit-level-preferences button": {
          text: linkedInAlreadyAppliedFixture.badgeTexts,
        },
        "a[href*='linkedin.com/company/']": {
          attributes: { href: linkedInAlreadyAppliedFixture.companyLinkedinUrl },
        },
        "a[href*='linkedin.com/company/'] img": {
          attributes: { src: linkedInAlreadyAppliedFixture.companyLogoUrl },
        },
        ".jobs-s-apply__application-link": {
          text: linkedInAlreadyAppliedFixture.appliedText,
        },
        ".artdeco-inline-feedback__message": {
          text: "Applied 4 minutes ago",
        },
        ".jobs-description-content__text": {
          text: linkedInAlreadyAppliedFixture.aboutText,
        },
        body: {
          text: [
            linkedInAlreadyAppliedFixture.titleText,
            linkedInAlreadyAppliedFixture.companyName,
            linkedInAlreadyAppliedFixture.locationMetaLine,
            linkedInAlreadyAppliedFixture.badgeTexts,
            linkedInAlreadyAppliedFixture.appliedText,
            linkedInAlreadyAppliedFixture.aboutText,
            linkedInAlreadyAppliedFixture.stickyMetaLine,
          ].join("\n"),
        },
      },
    });

    const result = await new LinkedInAdapter().extract(page as never, page.url());

    expect(result.title).toBe("Full Stack Engineer");
    expect(result.company).toBe("Wide and Wise");
    expect(result.companyLinkedinUrl).toBe("https://www.linkedin.com/company/wideandwise/life");
    expect(result.companyLogoUrl).toBe(linkedInAlreadyAppliedFixture.companyLogoUrl);
    expect(result.location).toBe("TÃ¼rkiye");
    expect(result.rawText).toContain("Workplace Type: remote");
    expect(result.rawText).toContain("Company LinkedIn URL: https://www.linkedin.com/company/wideandwise/life");
  });

  it("marks linkedin company-site apply buttons as external while keeping structured sections", async () => {
    const { LinkedInAdapter } = await import("../../src/adapters/LinkedInAdapter.js");
    const page = createMockPage({
      currentUrl: "https://www.linkedin.com/jobs/view/7777777777/",
      title: linkedInExternalApplyFixture.pageTitle,
      selectors: {
        ".job-details-jobs-unified-top-card__job-title": {
          text: linkedInExternalApplyFixture.titleText,
        },
        ".job-details-jobs-unified-top-card__company-name": {
          text: linkedInExternalApplyFixture.companyText,
        },
        "[data-testid='expandable-text-box']": { text: linkedInExternalApplyFixture.aboutExpanded },
        "button.jobs-apply-button": { text: "Apply" },
        body: { text: linkedInExternalApplyFixture.bodyText },
      },
    });

    const result = await new LinkedInAdapter().extract(page as never, page.url());

    expect(result.title).toBe("Senior Fullstack Developer");
    expect(result.company).toBe("Proxify");
    expect(result.companyLogoUrl).toBeNull();
    expect(result.companyLinkedinUrl).toBeNull();
    expect(result.applicationType).toBe("external");
    expect(result.descriptionText).toContain("Build remote-first fullstack applications.");
    expect(result.requirementsText).toContain("Strong TypeScript experience.");
    expect(result.rawText).toContain("Application Type: external");
  });
});

describe("GreenhouseAdapter", () => {
  it("matches greenhouse urls and extracts greenhouse fields", async () => {
    const page = createMockPage({
      currentUrl: "https://boards.greenhouse.io/company/jobs/1",
      selectors: {
        "#header .app-title": { text: "Staff Engineer" },
        "#header .company-name": { text: "Green Corp" },
        "#header .location": { text: "Berlin" },
        "a[href*='/applications/new']": {
          attributes: { href: "https://boards.greenhouse.io/company/jobs/1/apply" },
        },
        "#content": { text: "Greenhouse description" },
        "#content [id*='require']": { text: "Node.js, TypeScript" },
        "#content [id*='benefit']": { text: "Bonus, equity" },
        body: { text: "Greenhouse raw body" },
      },
    });

    const adapter = new GreenhouseAdapter();

    expect(adapter.canHandle(page.url())).toBe(true);
    const result = await adapter.extract(page as never, page.url());

    expect(result.platform).toBe("greenhouse");
    expect(result.title).toBe("Staff Engineer");
    expect(result.company).toBe("Green Corp");
    expect(result.companyLogoUrl).toBeNull();
    expect(result.companyLinkedinUrl).toBeNull();
    expect(result.location).toBe("Berlin");
    expect(result.applicationType).toBe("external");
    expect(result.descriptionText).toBe("Greenhouse description");
    expect(result.requirementsText).toBe("Node.js, TypeScript");
    expect(result.benefitsText).toBe("Bonus, equity");
  });
});

describe("LeverAdapter", () => {
  it("matches lever urls and extracts lever fields", async () => {
    const page = createMockPage({
      currentUrl: "https://jobs.lever.co/company/1",
      selectors: {
        ".posting-headline h2": { text: "Senior Product Designer" },
        ".main-header-text": { text: "Lever Labs" },
        ".posting-categories .location": { text: "London" },
        "a[href*='/apply']": {
          attributes: { href: "https://jobs.lever.co/company/1/apply" },
        },
        ".posting-page": { text: "Lever description" },
        ".posting-requirements": { text: "Portfolio required" },
        ".posting-benefits": { text: "Flexible PTO" },
        body: { text: "Lever raw body" },
      },
    });

    const adapter = new LeverAdapter();

    expect(adapter.canHandle(page.url())).toBe(true);
    const result = await adapter.extract(page as never, page.url());

    expect(result.platform).toBe("lever");
    expect(result.title).toBe("Senior Product Designer");
    expect(result.company).toBe("Lever Labs");
    expect(result.companyLogoUrl).toBeNull();
    expect(result.companyLinkedinUrl).toBeNull();
    expect(result.location).toBe("London");
    expect(result.applicationType).toBe("external");
    expect(result.applyUrl).toContain("/apply");
    expect(result.descriptionText).toBe("Lever description");
    expect(result.requirementsText).toBe("Portfolio required");
    expect(result.benefitsText).toBe("Flexible PTO");
  });
});
