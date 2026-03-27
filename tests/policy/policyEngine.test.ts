import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "../../src/policy/policyEngine.js";

const profile = {
  yearsOfExperience: 3,
  preferredRoles: ["Backend Engineer"],
  preferredTechStack: ["TypeScript", "Node.js"],
  excludedRoles: ["Senior", "Lead", "Staff"],
  preferredLocations: ["Remote"],
  excludedLocations: ["Istanbul onsite"],
  remotePreference: "remote",
  visaRequirement: "required",
  workAuthorizationStatus: "authorized",
  languages: ["English"],
  salaryExpectation: "market",
} as const;

describe("evaluatePolicy", () => {
  it("allows a clean job", () => {
    const result = evaluatePolicy(
      {
        title: "Backend Engineer",
        company: "Acme",
        location: "Remote",
        remoteType: "remote",
        seniority: "mid",
        mustHaveSkills: ["TypeScript"],
        niceToHaveSkills: [],
        technologies: ["TypeScript"],
        yearsRequired: 3,
        platform: "greenhouse",
        visaSponsorship: "yes",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      profile,
    );

    expect(result.allowed).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("rejects excluded onsite locations", () => {
    const result = evaluatePolicy(
      {
        title: "Backend Engineer",
        company: "Acme",
        location: "Istanbul",
        remoteType: "onsite",
        seniority: "mid",
        mustHaveSkills: ["TypeScript"],
        niceToHaveSkills: [],
        technologies: ["TypeScript"],
        yearsRequired: 3,
        platform: "generic",
        visaSponsorship: "yes",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      profile,
    );

    expect(result.allowed).toBe(false);
    expect(result.reasons.join(" ")).toContain("Istanbul onsite");
  });

  it("rejects sponsorship mismatches", () => {
    const result = evaluatePolicy(
      {
        title: "Backend Engineer",
        company: "Acme",
        location: "Remote",
        remoteType: "remote",
        seniority: "mid",
        mustHaveSkills: ["TypeScript"],
        niceToHaveSkills: [],
        technologies: ["TypeScript"],
        yearsRequired: 3,
        platform: "generic",
        visaSponsorship: "no",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      profile,
    );

    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("Visa sponsorship mismatch.");
  });

  it("rejects unknown work authorization and too many open questions", () => {
    const result = evaluatePolicy(
      {
        title: null,
        company: "Acme",
        location: null,
        remoteType: "unknown",
        seniority: "unknown",
        mustHaveSkills: [],
        niceToHaveSkills: [],
        technologies: [],
        yearsRequired: null,
        platform: "generic",
        visaSponsorship: "unknown",
        workAuthorization: "unknown",
        openQuestionsCount: 4,
      },
      profile,
    );

    expect(result.allowed).toBe(false);
    expect(result.reasons.join(" ")).toContain("Work authorization is unknown");
    expect(result.reasons.join(" ")).toContain("Too many open questions");
    expect(result.reasons.join(" ")).toContain("Missing required fields");
  });

  it("rejects conflicting seniority data", () => {
    const result = evaluatePolicy(
      {
        title: "Staff Backend Engineer",
        company: "Acme",
        location: "Remote",
        remoteType: "remote",
        seniority: "staff",
        mustHaveSkills: ["TypeScript"],
        niceToHaveSkills: [],
        technologies: ["TypeScript"],
        yearsRequired: 8,
        platform: "greenhouse",
        visaSponsorship: "yes",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      profile,
    );

    expect(result.allowed).toBe(false);
    expect(result.reasons.join(" ")).toContain("Role excluded by profile");
  });
});
