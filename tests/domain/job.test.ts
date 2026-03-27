import { describe, expect, it } from "vitest";
import { normalizeParsedJob } from "../../src/domain/job.js";

describe("normalizeParsedJob", () => {
  it("maps parsed and extracted job data into a stable normalized model", () => {
    const normalized = normalizeParsedJob(
      {
        title: null,
        company: null,
        location: null,
        platform: "greenhouse",
        seniority: "Senior",
        mustHaveSkills: ["TypeScript", "Node.js"],
        niceToHaveSkills: ["Prisma"],
        technologies: ["AWS"],
        yearsRequired: 5,
        remoteType: "Remote",
        visaSponsorship: "yes",
        workAuthorization: "authorized",
      },
      {
        rawText: "TypeScript Node.js AWS",
        title: "Senior Backend Engineer",
        company: "Acme",
        location: "Remote - Europe",
        platform: "greenhouse",
        applyUrl: "https://apply.example.com",
        currentUrl: "https://jobs.example.com/1",
        descriptionText: "Build backend systems with TypeScript and AWS.",
        requirementsText: "5 years of experience with Node.js.",
        benefitsText: "Remote first.",
      },
    );

    expect(normalized.title).toBe("Senior Backend Engineer");
    expect(normalized.company).toBe("Acme");
    expect(normalized.location).toBe("Remote - Europe");
    expect(normalized.remoteType).toBe("remote");
    expect(normalized.seniority).toBe("senior");
    expect(normalized.technologies).toEqual(
      expect.arrayContaining(["TypeScript", "Node.js", "AWS", "Prisma"]),
    );
    expect(normalized.yearsRequired).toBe(5);
  });

  it("handles unknown and missing values", () => {
    const normalized = normalizeParsedJob(
      {
        title: null,
        company: null,
        location: null,
        platform: null,
        seniority: null,
        mustHaveSkills: [],
        niceToHaveSkills: [],
        technologies: [],
        yearsRequired: null,
        remoteType: null,
        visaSponsorship: null,
        workAuthorization: null,
      },
      {
        rawText: "Unknown posting",
        title: null,
        company: null,
        location: null,
        platform: "generic",
        applyUrl: null,
        currentUrl: "https://jobs.example.com/2",
        descriptionText: null,
        requirementsText: null,
        benefitsText: null,
      },
    );

    expect(normalized.remoteType).toBe("unknown");
    expect(normalized.seniority).toBe("unknown");
    expect(normalized.openQuestionsCount).toBeGreaterThan(2);
  });

  it("canonicalizes hybrid, onsite, lead, principal, and sponsorship fallback values", () => {
    const hybridLead = normalizeParsedJob(
      {
        title: "Lead Platform Engineer",
        company: "Acme",
        location: "Berlin",
        platform: "generic",
        seniority: "Lead",
        mustHaveSkills: [],
        niceToHaveSkills: [],
        technologies: [],
        yearsRequired: 4.6,
        remoteType: "Hybrid",
        visaSponsorship: null,
        workAuthorization: "requires-sponsorship",
      },
      {
        rawText: "Hybrid role",
        title: null,
        company: null,
        location: null,
        platform: "generic",
        applyUrl: null,
        currentUrl: "https://jobs.example.com/3",
        descriptionText: null,
        requirementsText: null,
        benefitsText: null,
      },
    );

    const onsitePrincipal = normalizeParsedJob(
      {
        title: "Principal Engineer",
        company: "Acme",
        location: "London",
        platform: "generic",
        seniority: null,
        mustHaveSkills: [],
        niceToHaveSkills: [],
        technologies: [],
        yearsRequired: -2,
        remoteType: "On-site",
        visaSponsorship: "no",
        workAuthorization: null,
      },
      {
        rawText: "On-site principal role",
        title: null,
        company: null,
        location: null,
        platform: "generic",
        applyUrl: null,
        currentUrl: "https://jobs.example.com/4",
        descriptionText: null,
        requirementsText: null,
        benefitsText: null,
      },
    );

    expect(hybridLead.remoteType).toBe("hybrid");
    expect(hybridLead.seniority).toBe("lead");
    expect(hybridLead.yearsRequired).toBe(5);
    expect(hybridLead.visaSponsorship).toBe("unknown");
    expect(hybridLead.workAuthorization).toBe("requires-sponsorship");

    expect(onsitePrincipal.remoteType).toBe("onsite");
    expect(onsitePrincipal.seniority).toBe("principal");
    expect(onsitePrincipal.yearsRequired).toBe(0);
    expect(onsitePrincipal.visaSponsorship).toBe("no");
    expect(onsitePrincipal.workAuthorization).toBe("unknown");
  });
});
