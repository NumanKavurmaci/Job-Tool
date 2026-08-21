import { describe, expect, it, vi } from "vitest";
import {
  extractJobPostingStructuredData,
  normalizeStructuredWorkplaceType,
  resolveHttpUrl,
} from "../../src/adapters/structuredData.js";

function pageWithJsonLd(entries: string[]) {
  return {
    evaluate: vi.fn(async (callback: () => unknown) => {
      const previousDocument = (globalThis as any).document;
      (globalThis as any).document = {
        querySelectorAll: () => entries.map((textContent) => ({ textContent })),
        createElement: () => {
          let html = "";
          return {
            set innerHTML(value: string) {
              html = value;
            },
            get content() {
              return { textContent: html.replace(/<[^>]+>/g, " ") };
            },
          };
        },
      };
      try {
        return callback();
      } finally {
        (globalThis as any).document = previousDocument;
      }
    }),
  };
}

describe("common JobPosting structured data", () => {
  it("extracts a JobPosting from an array/@graph while ignoring malformed scripts", async () => {
    const page = pageWithJsonLd([
      "not-json",
      JSON.stringify({
        "@graph": [
          { "@type": "BreadcrumbList" },
          {
            "@type": ["Thing", "JobPosting"],
            title: "Senior Backend Engineer",
            hiringOrganization: {
              name: "Acme",
              logo: { url: "https://cdn.example/acme.png" },
            },
            jobLocationType: "TELECOMMUTE",
            applicantLocationRequirements: [{ name: "Türkiye" }, { name: "Europe" }],
            employmentType: ["FULL_TIME", "CONTRACTOR"],
            description: "<p>Build <strong>APIs</strong>.</p>",
            qualifications: "<ul><li>TypeScript</li></ul>",
            skills: ["Node.js", "PostgreSQL"],
            jobBenefits: "<p>Remote budget</p>",
            url: "https://jobs.example/roles/123",
          },
        ],
      }),
    ]);

    await expect(extractJobPostingStructuredData(page as never)).resolves.toEqual({
      title: "Senior Backend Engineer",
      company: "Acme",
      companyLogoUrl: "https://cdn.example/acme.png",
      location: "Türkiye, Europe",
      workplaceType: "TELECOMMUTE",
      employmentType: "FULL_TIME\nCONTRACTOR",
      descriptionText: "Build APIs .",
      requirementsText: "TypeScript\nNode.js\nPostgreSQL",
      benefitsText: "Remote budget",
      canonicalUrl: "https://jobs.example/roles/123",
    });
  });

  it("normalizes safe relative links and structured workplace values", () => {
    expect(resolveHttpUrl("/apply", "https://jobs.example/roles/1")).toBe(
      "https://jobs.example/apply",
    );
    expect(resolveHttpUrl("javascript:alert(1)", "https://jobs.example/roles/1")).toBeNull();
    expect(resolveHttpUrl("https://user:secret@jobs.example/apply", "https://jobs.example")).toBeNull();
    expect(normalizeStructuredWorkplaceType("TELECOMMUTE")).toBe("remote");
    expect(normalizeStructuredWorkplaceType("Hybrid")).toBe("hybrid");
  });
});
