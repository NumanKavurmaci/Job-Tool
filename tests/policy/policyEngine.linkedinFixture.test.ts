import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LinkedInAdapter } from "../../src/adapters/LinkedInAdapter.js";
import { normalizeParsedJob } from "../../src/domain/job.js";
import { evaluatePolicy } from "../../src/policy/policyEngine.js";
import type { CandidateProfile } from "../../src/profile/candidate.js";
import { createMockPage } from "../utils/fakePage.js";

const profile: CandidateProfile = {
  yearsOfExperience: 3,
  preferredRoles: ["Backend Engineer"],
  preferredTechStack: ["TypeScript", "Node.js"],
  aspirationalTechStack: ["React", "Next.js"],
  preferredRoleOverlapSignals: ["frontend", "front-end", "full stack", "fullstack"],
  disallowedRoleKeywords: ["ios", "android", "mechanical", "researcher"],
  excludedRoles: ["Senior", "Lead", "Staff"],
  preferredLocations: ["Remote"],
  excludedLocations: ["Istanbul onsite"],
  allowedHybridLocations: ["Ankara", "Izmir", "EskiSehir", "Eskisehir", "Samsun"],
  workplacePolicyBypassLocations: ["Europe"],
  remotePreference: "remote",
  remoteOnly: true,
  visaRequirement: "required",
  workAuthorizationStatus: "authorized",
  languages: ["English"],
  experienceOverrides: {},
  salaryExpectations: {
    usd: null,
    eur: null,
    try: null,
  },
  gpa: null,
  salaryExpectation: "market",
  disability: {
    hasVisualDisability: false,
    disabilityPercentage: null,
    requiresAccommodation: null,
    accommodationNotes: null,
    disclosurePreference: "manual-review",
  },
};

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function htmlToText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<\/(p|li|ul|ol|div|h2|h3|strong)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\r/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function matchOrThrow(source: string, pattern: RegExp, label: string): string {
  const match = source.match(pattern)?.[1];
  if (!match) {
    throw new Error(`Missing fixture field: ${label}`);
  }

  return decodeHtmlEntities(match.trim());
}

describe("policyEngine linkedin html regression", () => {
  it("blocks the Istanbul/Türkiye hybrid Solid-ICT fixture even if parsed data hallucinates Europe", async () => {
    const fixturePath = path.resolve(
      process.cwd(),
      "tests",
      "fixtures",
      "html",
      "linkedin-4395042318.html",
    );
    const html = readFileSync(fixturePath, "utf8");

    expect(html).toContain("Backend Developer");
    expect(html).toContain("Istanbul, Türkiye");
    expect(html).toContain("Hybrid");
    expect(html).toContain("Easy Apply");

    const company = matchOrThrow(
      html,
      /<a class="_112a7898 _727ac2a2 _38a26304 d4697dfb" href="https:\/\/www\.linkedin\.com\/company\/solidict\/life\/">([^<]+)<\/a>/,
      "company",
    );
    const title = matchOrThrow(
      html,
      /<p class="_6b06b22f _9c3c3006 b2efed5c _47af83a7 _2327f28f aa661bbd _62051d4a _112a7898 _9ebd600b">([^<]+)<\/p>/,
      "title",
    );
    const location = matchOrThrow(
      html,
      /<span class="_2da8c981">([^<]+)<\/span><span class="_17b965d8"> <\/span>·/,
      "location",
    );
    const companyLinkedinUrl = matchOrThrow(
      html,
      /<a tabindex="0" class="_482bb42c _265b58d3 d8cc214b b92edba5 _25ba201b c0a96313 _737a8a8c _75aa736f bbb29d8d _9572431e" href="(https:\/\/www\.linkedin\.com\/company\/solidict\/life\/)"/,
      "company linkedin url",
    );
    const companyLogoUrl = matchOrThrow(
      html,
      /<img class="e740702b _2d43be3f d15bfc34 f7e4b8f0 c2b9f67b" fetchpriority="low" alt="Company logo for, Solid-ICT\." src="([^"]+)"/,
      "company logo url",
    );
    const aboutSectionHtml = matchOrThrow(
      html,
      /<h2 class="_6b06b22f _84c1daaf ec67e03b b2efed5c _47af83a7 _2327f28f aa661bbd _62051d4a _112a7898 _9ebd600b">About the job<\/h2>([\s\S]*?)<div class="dee3d6ca" componentkey="JobDetails_AboutTheCompany_4395042318">/,
      "about section",
    );
    const aboutText = htmlToText(aboutSectionHtml);

    const page = createMockPage({
      currentUrl: "https://www.linkedin.com/jobs/view/4395042318/",
      title: "Solid-ICT hiring Backend Developer in Istanbul, Türkiye | LinkedIn",
      selectors: {
        ".jobs-unified-top-card": { text: "Signed in card" },
        "a[href*='linkedin.com/company/'][componentkey] p": { text: company },
        "a[href*='linkedin.com/company/'][componentkey]": {
          attributes: { href: companyLinkedinUrl },
        },
        "a[href*='linkedin.com/company/'] img[alt*='Company logo']": {
          attributes: { src: companyLogoUrl },
        },
        "a[href*='linkedin.com/jobs/view'] span": { text: "Hybrid\nFull-time" },
        "button[aria-label*='Easy Apply']": { text: "Easy Apply" },
        "[data-testid='expandable-text-box']": { text: aboutText },
        body: {
          text: [
            title,
            company,
            location,
            "Hybrid",
            "Full-time",
            "Easy Apply",
            aboutText,
          ].join("\n"),
        },
      },
    });

    const extracted = await new LinkedInAdapter().extract(page as never, page.url());

    expect(extracted.title).toBe("Backend Developer");
    expect(extracted.company).toBe("Solid-ICT");
    expect(extracted.location).toBe("Istanbul, Türkiye");
    expect(extracted.applicationType).toBe("easy_apply");
    expect(extracted.rawText).toContain("Workplace Type: hybrid");

    const normalized = normalizeParsedJob(
      {
        title: "Backend Developer",
        company: "Solid-ICT",
        location: "Europe",
        platform: "linkedin",
        seniority: null,
        mustHaveSkills: [],
        niceToHaveSkills: [],
        technologies: [],
        yearsRequired: 5,
        remoteType: "remote",
        visaSponsorship: null,
        workAuthorization: null,
      },
      extracted,
    );

    const policy = evaluatePolicy(normalized, profile);

    expect(normalized.location).toBe("Istanbul, Türkiye");
    expect(normalized.remoteType).toBe("hybrid");
    expect(policy.allowed).toBe(false);
    expect(policy.reasons).toContain(
      "Hybrid roles are only allowed in: Ankara, Izmir, EskiSehir, Eskisehir, Samsun.",
    );
  });
});
