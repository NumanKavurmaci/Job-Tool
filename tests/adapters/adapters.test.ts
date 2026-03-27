import { afterEach, describe, expect, it, vi } from "vitest";
import { GenericAdapter } from "../../src/adapters/GenericAdapter.js";
import { GreenhouseAdapter } from "../../src/adapters/GreenhouseAdapter.js";
import { LeverAdapter } from "../../src/adapters/LeverAdapter.js";
import { createMockPage } from "../utils/fakePage.js";

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
      },
    }));

    const { LinkedInAdapter } = await import("../../src/adapters/LinkedInAdapter.js");
    let isAuthenticated = false;
    const jobUrl = "https://www.linkedin.com/jobs/view/1234567890/";
    const page = createMockPage({
      currentUrl: jobUrl,
      routes: {
        [jobUrl]: () =>
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
    expect(result.applicationType).toBe("easy_apply");
  });

  it("accepts alternate linkedin login field selectors", async () => {
    vi.doMock("../../src/config/env.js", () => ({
      env: {
        LINKEDIN_USERNAME: "user@example.com",
        LINKEDIN_PASSWORD: "secret",
      },
    }));

    const { LinkedInAdapter } = await import("../../src/adapters/LinkedInAdapter.js");
    let isAuthenticated = false;
    const jobUrl = "https://www.linkedin.com/jobs/view/987654321/";
    const page = createMockPage({
      currentUrl: jobUrl,
      routes: {
        [jobUrl]: () =>
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
  });

  it("fails clearly when linkedin still requires authentication and no credentials exist", async () => {
    vi.doMock("../../src/config/env.js", () => ({
      env: {
        LINKEDIN_USERNAME: undefined,
        LINKEDIN_PASSWORD: undefined,
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
  });

  it("fails with a specific challenge error when linkedin redirects to security verification", async () => {
    vi.doMock("../../src/config/env.js", () => ({
      env: {
        LINKEDIN_USERNAME: "user@example.com",
        LINKEDIN_PASSWORD: "secret",
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
    expect(result.location).toBe("London");
    expect(result.applicationType).toBe("external");
    expect(result.applyUrl).toContain("/apply");
    expect(result.descriptionText).toBe("Lever description");
    expect(result.requirementsText).toBe("Portfolio required");
    expect(result.benefitsText).toBe("Flexible PTO");
  });
});
