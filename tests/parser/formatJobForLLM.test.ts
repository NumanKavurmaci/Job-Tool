import { describe, expect, it } from "vitest";
import { formatJobForLLM, section } from "../../src/parser/formatJobForLLM.js";

describe("formatJobForLLM", () => {
  it("formats a clean structured prompt", () => {
    const output = formatJobForLLM({
      rawText: "Raw body",
      title: "Backend Engineer",
      company: "Acme",
      location: "Remote",
      platform: "greenhouse",
      applyUrl: "https://apply.example.com",
      currentUrl: "https://jobs.example.com/backend",
      descriptionText: "Build APIs",
      requirementsText: "TypeScript",
      benefitsText: "Equity",
    });

    expect(output).toContain("Title: Backend Engineer");
    expect(output).toContain("Company: Acme");
    expect(output).toContain("Description:\nBuild APIs");
    expect(output).toContain("Requirements:\nTypeScript");
    expect(output).toContain("Benefits:\nEquity");
  });

  it("uses fallback values for empty sections", () => {
    expect(section("Benefits", "   ")).toBe("Benefits:\nN/A");
  });

  it("formats linkedin-style extracted content into a clean prompt", () => {
    const output = formatJobForLLM({
      rawText: "LinkedIn raw body",
      title: "Staff Data Engineer",
      company: "Example Corp",
      location: "Remote",
      platform: "generic",
      applyUrl: "https://www.linkedin.com/jobs/view/1234567890/",
      currentUrl: "https://www.linkedin.com/jobs/view/1234567890/",
      descriptionText: "Design and operate data pipelines.",
      requirementsText: "Strong SQL and Python experience.",
      benefitsText: null,
    });

    expect(output).toContain("Platform: generic");
    expect(output).toContain(
      "Apply URL: https://www.linkedin.com/jobs/view/1234567890/",
    );
    expect(output).toContain("Description:\nDesign and operate data pipelines.");
    expect(output).toContain("Requirements:\nStrong SQL and Python experience.");
    expect(output).toContain("Benefits:\nN/A");
  });

  it("omits location from the LLM payload when structured location is already trusted", () => {
    const output = formatJobForLLM(
      {
        rawText: "LinkedIn raw body",
        title: "Backend Engineer",
        company: "Acme",
        location: "Istanbul, Türkiye",
        platform: "linkedin",
        applicationType: "easy_apply",
        applyUrl: "https://www.linkedin.com/jobs/view/1234567890/",
        currentUrl: "https://www.linkedin.com/jobs/view/1234567890/",
        descriptionText: "Hybrid collaboration model.",
        requirementsText: "Node.js",
        benefitsText: null,
      },
      { omitLocation: true },
    );

    expect(output).not.toContain("Location:");
    expect(output).toContain("Title: Backend Engineer");
    expect(output).toContain("Company: Acme");
  });

  it("keeps location in the prompt when no lock is requested", () => {
    const output = formatJobForLLM({
      rawText: "LinkedIn raw body",
      title: "Backend Engineer",
      company: "Acme",
      location: "Istanbul, Türkiye",
      platform: "linkedin",
      applicationType: "easy_apply",
      applyUrl: "https://www.linkedin.com/jobs/view/1234567890/",
      currentUrl: "https://www.linkedin.com/jobs/view/1234567890/",
      descriptionText: "Hybrid collaboration model.",
      requirementsText: "Node.js",
      benefitsText: null,
    });

    expect(output).toContain("Location: Istanbul, Türkiye");
  });

  it("omits only the location line while keeping application metadata", () => {
    const output = formatJobForLLM(
      {
        rawText: "LinkedIn raw body",
        title: "Backend Engineer",
        company: "Acme",
        location: "Istanbul, Türkiye",
        platform: "linkedin",
        applicationType: "easy_apply",
        applyUrl: "https://www.linkedin.com/jobs/view/1234567890/",
        currentUrl: "https://www.linkedin.com/jobs/view/1234567890/",
        descriptionText: "Hybrid collaboration model.",
        requirementsText: "Node.js",
        benefitsText: null,
      },
      { omitLocation: true },
    );

    expect(output).toContain("Platform: linkedin");
    expect(output).toContain("Application Type: easy_apply");
    expect(output).toContain(
      "Apply URL: https://www.linkedin.com/jobs/view/1234567890/",
    );
    expect(output).not.toContain("Location:");
  });

  it("falls back to N/A when location is missing and omission is not requested", () => {
    const output = formatJobForLLM({
      rawText: "LinkedIn raw body",
      title: "Backend Engineer",
      company: "Acme",
      location: null,
      platform: "linkedin",
      applicationType: null,
      applyUrl: null,
      currentUrl: "https://www.linkedin.com/jobs/view/1234567890/",
      descriptionText: "Hybrid collaboration model.",
      requirementsText: "Node.js",
      benefitsText: null,
    });

    expect(output).toContain("Location: N/A");
  });
});
