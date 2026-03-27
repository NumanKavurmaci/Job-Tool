import { describe, expect, it } from "vitest";
import { GenericAdapter } from "../../src/adapters/GenericAdapter.js";
import { GreenhouseAdapter } from "../../src/adapters/GreenhouseAdapter.js";
import { LeverAdapter } from "../../src/adapters/LeverAdapter.js";
import { createMockPage } from "../utils/fakePage.js";

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
    expect(result.applyUrl).toContain("/apply");
    expect(result.descriptionText).toBe("Lever description");
    expect(result.requirementsText).toBe("Portfolio required");
    expect(result.benefitsText).toBe("Flexible PTO");
  });
});
