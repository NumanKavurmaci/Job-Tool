import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "../../src/policy/policyEngine.js";

const profile = {
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
        applicationType: "external",
        visaSponsorship: "yes",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      profile,
    );

    expect(result.allowed).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("rejects onsite roles", () => {
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
        applicationType: "unknown",
        visaSponsorship: "yes",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      profile,
    );

    expect(result.allowed).toBe(false);
    expect(result.reasons.join(" ")).toContain("On-site roles are blocked by profile.");
  });

  it("allows hybrid roles in configured cities and rejects others", () => {
    const allowed = evaluatePolicy(
      {
        title: "Backend Engineer",
        company: "Acme",
        location: "Ankara, Turkey",
        remoteType: "hybrid",
        seniority: "mid",
        mustHaveSkills: [],
        niceToHaveSkills: [],
        technologies: [],
        yearsRequired: 3,
        platform: "generic",
        applicationType: "unknown",
        visaSponsorship: "yes",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      profile,
    );
    const blocked = evaluatePolicy(
      {
        title: "Backend Engineer",
        company: "Acme",
        location: "Berlin, Germany",
        remoteType: "hybrid",
        seniority: "mid",
        mustHaveSkills: [],
        niceToHaveSkills: [],
        technologies: [],
        yearsRequired: 3,
        platform: "generic",
        applicationType: "unknown",
        visaSponsorship: "yes",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      profile,
    );

    expect(allowed.allowed).toBe(true);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reasons.join(" ")).toContain("Hybrid roles are only allowed in");
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
        applicationType: "unknown",
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
        applicationType: "unknown",
        visaSponsorship: "unknown",
        workAuthorization: "unknown",
        openQuestionsCount: 4,
      },
      { ...profile, workAuthorizationStatus: "unknown" },
    );

    expect(result.allowed).toBe(false);
    expect(result.reasons.join(" ")).toContain("Work authorization is unknown");
    expect(result.reasons.join(" ")).toContain("Too many open questions");
    expect(result.reasons.join(" ")).toContain("Missing required fields");
  });

  it("does not reject only because job work authorization is unknown when candidate status is known", () => {
    const result = evaluatePolicy(
      {
        title: "Backend Engineer",
        company: "Acme",
        location: "Remote",
        remoteType: "unknown",
        seniority: "unknown",
        mustHaveSkills: ["TypeScript"],
        niceToHaveSkills: [],
        technologies: ["TypeScript"],
        yearsRequired: 3,
        platform: "generic",
        applicationType: "unknown",
        visaSponsorship: "unknown",
        workAuthorization: "unknown",
        openQuestionsCount: 1,
      },
      profile,
    );

    expect(result.allowed).toBe(true);
    expect(result.reasons).toEqual([]);
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
        applicationType: "external",
        visaSponsorship: "yes",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      profile,
    );

    expect(result.allowed).toBe(false);
    expect(result.reasons.join(" ")).toContain("Role excluded by profile");
  });

  it("rejects linkedin jobs that are not easy apply in this phase", () => {
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
        platform: "linkedin",
        applicationType: "external",
        visaSponsorship: "yes",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      profile,
    );

    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("Only LinkedIn Easy Apply jobs are allowed in this phase.");
  });

  it("rejects disallowed role families from profile negatives", () => {
    const result = evaluatePolicy(
      {
        title: "iOS Developer (English required)",
        company: "Acme",
        location: "Remote",
        remoteType: "remote",
        seniority: "mid",
        mustHaveSkills: [],
        niceToHaveSkills: [],
        technologies: ["Swift"],
        yearsRequired: 3,
        platform: "linkedin",
        applicationType: "easy_apply",
        visaSponsorship: "yes",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      profile,
    );

    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("Role family excluded by profile: ios.");
  });

  it("rejects pure java roles without target stack overlap", () => {
    const result = evaluatePolicy(
      {
        title: "Java Developer",
        company: "Acme",
        location: "Remote",
        remoteType: "remote",
        seniority: "mid",
        mustHaveSkills: ["Java"],
        niceToHaveSkills: [],
        technologies: ["Java", "Spring"],
        yearsRequired: 3,
        platform: "linkedin",
        applicationType: "easy_apply",
        visaSponsorship: "yes",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      profile,
    );

    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain(
      "Role family excluded by profile: pure Java role without target stack overlap.",
    );
  });

  it("allows java roles when they overlap with target frontend/full-stack signals", () => {
    const result = evaluatePolicy(
      {
        title: "Java Developer (React/Java stack)",
        company: "Acme",
        location: "Remote",
        remoteType: "remote",
        seniority: "mid",
        mustHaveSkills: ["Java", "React"],
        niceToHaveSkills: [],
        technologies: ["Java", "React", "TypeScript"],
        yearsRequired: 3,
        platform: "linkedin",
        applicationType: "easy_apply",
        visaSponsorship: "yes",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      profile,
    );

    expect(result.allowed).toBe(true);
    expect(
      result.reasons.some((reason) =>
        reason.includes("pure Java role without target stack overlap"),
      ),
    ).toBe(false);
  });
});
