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
});
