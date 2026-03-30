import { describe, expect, it } from "vitest";
import type { NormalizedJob } from "../../src/domain/job.js";
import type { CandidateProfile } from "../../src/profile/candidate.js";
import {
  collectPolicyReasons,
  evaluatePolicy,
  getMissingRequiredFields,
  hasPreferredStackOverlap,
  isEuropeCenteredJob,
  isEuropeCenteredLocationText,
  isPureJavaRole,
  matchesConfiguredWorkplacePolicyBypass,
  normalizePolicyText,
  shouldBypassWorkplacePolicy,
} from "../../src/policy/policyEngine.js";

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

function makeJob(overrides: Partial<NormalizedJob> = {}): NormalizedJob {
  return {
    title: "Backend Engineer",
    company: "Acme",
    location: "Remote",
    remoteType: "remote",
    seniority: "mid",
    mustHaveSkills: ["TypeScript"],
    niceToHaveSkills: [],
    technologies: ["TypeScript", "Node.js"],
    yearsRequired: 3,
    platform: "generic",
    applicationType: "unknown",
    visaSponsorship: "yes",
    workAuthorization: "authorized",
    openQuestionsCount: 0,
    ...overrides,
  };
}

describe("policyEngine helpers", () => {
  it("normalizes policy text in a diacritic-safe way", () => {
    expect(normalizePolicyText("  TÜRKIYE  ")).toBe("turkiye");
    expect(normalizePolicyText("Şişli, İstanbul")).toBe("sısli, istanbul".replace("sı", "si")); // avoid locale brittleness
  });

  it.each([
    "Berlin, Germany",
    "Amsterdam, Netherlands",
    "Europe",
    "EMEA remote",
    "Madrid, Spain",
    "Dublin, Ireland",
  ])("detects Europe-centered location %s", (location) => {
    expect(isEuropeCenteredLocationText(location)).toBe(true);
    expect(isEuropeCenteredJob({ location } as Pick<NormalizedJob, "location">)).toBe(true);
  });

  it.each([
    "",
    "Remote",
    "Austin, Texas, United States",
    "Şişli, Istanbul, Türkiye",
    "Türkiye",
    "Turkey",
  ])("does not detect non-Europe bypass location %s", (location) => {
    expect(isEuropeCenteredLocationText(location)).toBe(false);
  });

  it("matches configured workplace bypass via Europe region labels and explicit substrings", () => {
    expect(matchesConfiguredWorkplacePolicyBypass("Berlin, Germany", ["Europe"])).toBe(true);
    expect(matchesConfiguredWorkplacePolicyBypass("Belgium (Gent region)", ["eu"])).toBe(true);
    expect(matchesConfiguredWorkplacePolicyBypass("Amsterdam, Netherlands", ["netherlands"])).toBe(
      true,
    );
    expect(matchesConfiguredWorkplacePolicyBypass("Amsterdam, Netherlands", ["  EUROPE  "])).toBe(
      true,
    );
    expect(matchesConfiguredWorkplacePolicyBypass("Remote", ["Europe"])).toBe(false);
  });

  it("does not let Europe bypass match logged Turkey locations", () => {
    for (const location of [
      "Şişli, Istanbul, Türkiye",
      "Türkiye",
      "Istanbul, Istanbul, Türkiye",
      "Istanbul, Türkiye",
    ]) {
      expect(matchesConfiguredWorkplacePolicyBypass(location, ["Europe"])).toBe(false);
      expect(
        shouldBypassWorkplacePolicy({ location } as Pick<NormalizedJob, "location">, profile),
      ).toBe(false);
    }
  });

  it("detects preferred stack overlap from technologies and role signals", () => {
    expect(
      hasPreferredStackOverlap(
        makeJob({
          title: "Platform Engineer",
          mustHaveSkills: ["observability"],
          technologies: ["React", "TypeScript"],
        }),
        profile,
      ),
    ).toBe(true);

    expect(
      hasPreferredStackOverlap(
        makeJob({
          title: "Cobol Developer",
          mustHaveSkills: ["COBOL"],
          technologies: ["COBOL"],
        }),
        profile,
      ),
    ).toBe(false);
  });

  it("matches overlap and role keywords in a diacritic-insensitive way", () => {
    expect(
      hasPreferredStackOverlap(
        makeJob({
          title: "Front-end Muhendisi",
          mustHaveSkills: ["React"],
          technologies: ["TypeScript"],
        }),
        profile,
      ),
    ).toBe(true);

    const reasons = collectPolicyReasons(
      makeJob({
        title: "IOS Muhendisi",
      }),
      profile,
    );

    expect(reasons).toContain("Role family excluded by profile: ios.");
  });

  it("detects pure Java roles only when there is no target stack overlap", () => {
    expect(
      isPureJavaRole(
        makeJob({
          title: "Java Developer",
          mustHaveSkills: ["Java"],
          technologies: ["Java", "Spring"],
        }),
        profile,
      ),
    ).toBe(true);

    expect(
      isPureJavaRole(
        makeJob({
          title: "Java Developer (React/Java stack)",
          mustHaveSkills: ["Java", "React"],
          technologies: ["Java", "React", "TypeScript"],
        }),
        profile,
      ),
    ).toBe(false);
  });

  it("returns exact missing required fields in a stable order", () => {
    expect(getMissingRequiredFields(makeJob({ title: null, company: null, location: null }))).toEqual([
      "title",
      "company",
      "location",
    ]);
    expect(getMissingRequiredFields(makeJob())).toEqual([]);
  });
});

describe("collectPolicyReasons", () => {
  it("returns no reasons for a clean allowed job", () => {
    const reasons = collectPolicyReasons(
      makeJob({
        platform: "greenhouse",
        applicationType: "external",
      }),
      profile,
    );

    expect(reasons).toEqual([]);
  });

  it("collects multiple independent reasons without dropping any", () => {
    const reasons = collectPolicyReasons(
      makeJob({
        title: "Lead iOS Developer",
        location: "Istanbul onsite",
        remoteType: "onsite",
        platform: "linkedin",
        applicationType: "external",
        visaSponsorship: "no",
        openQuestionsCount: 4,
      }),
      { ...profile, workAuthorizationStatus: "unknown" },
    );

    expect(reasons).toEqual(
      expect.arrayContaining([
        "Only LinkedIn Easy Apply jobs are allowed in this phase.",
        "Role excluded by profile: Lead.",
        "Role family excluded by profile: ios.",
        "Location excluded by profile: Istanbul onsite.",
        "On-site roles are blocked by profile.",
        "Visa sponsorship mismatch.",
        "Too many open questions: 4.",
      ]),
    );
  });
});

describe("evaluatePolicy", () => {
  it("allows a clean job", () => {
    const result = evaluatePolicy(
      makeJob({
        platform: "greenhouse",
        applicationType: "external",
      }),
      profile,
    );

    expect(result.allowed).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("rejects onsite roles when no workplace bypass applies", () => {
    const result = evaluatePolicy(
      makeJob({
        location: "Istanbul",
        remoteType: "onsite",
      }),
      profile,
    );

    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("On-site roles are blocked by profile.");
  });

  it("allows configured hybrid cities and rejects other hybrid locations", () => {
    const allowed = evaluatePolicy(
      makeJob({
        location: "Ankara, Turkey",
        remoteType: "hybrid",
      }),
      profile,
    );
    const blocked = evaluatePolicy(
      makeJob({
        location: "Austin, Texas, United States",
        remoteType: "hybrid",
      }),
      profile,
    );

    expect(allowed.allowed).toBe(true);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reasons.join(" ")).toContain("Hybrid roles are only allowed in");
  });

  it("bypasses workplace policy for Europe-centered onsite and hybrid roles", () => {
    const onsiteEurope = evaluatePolicy(
      makeJob({
        location: "Berlin, Germany",
        remoteType: "onsite",
      }),
      profile,
    );
    const hybridEurope = evaluatePolicy(
      makeJob({
        location: "Madrid, Spain",
        remoteType: "hybrid",
      }),
      profile,
    );

    expect(onsiteEurope.allowed).toBe(true);
    expect(hybridEurope.allowed).toBe(true);
    expect(onsiteEurope.reasons).not.toContain("On-site roles are blocked by profile.");
    expect(hybridEurope.reasons.some((reason) => reason.includes("Hybrid roles are only allowed in"))).toBe(
      false,
    );
  });

  it("does not treat logged Turkey locations as Europe bypass matches", () => {
    const result = evaluatePolicy(
      makeJob({
        location: "Şişli, Istanbul, Türkiye",
        remoteType: "hybrid",
        platform: "linkedin",
        applicationType: "easy_apply",
      }),
      profile,
    );

    expect(result.allowed).toBe(false);
    expect(result.reasons.join(" ")).toContain("Hybrid roles are only allowed in");
  });

  it("rejects sponsorship mismatches only when the candidate requires sponsorship", () => {
    const blocked = evaluatePolicy(
      makeJob({
        visaSponsorship: "no",
      }),
      profile,
    );
    const allowed = evaluatePolicy(
      makeJob({
        visaSponsorship: "no",
      }),
      { ...profile, visaRequirement: "not-required" },
    );

    expect(blocked.allowed).toBe(false);
    expect(blocked.reasons).toContain("Visa sponsorship mismatch.");
    expect(allowed.reasons).not.toContain("Visa sponsorship mismatch.");
  });

  it("rejects unknown work authorization only when the candidate profile is also unknown", () => {
    const blocked = evaluatePolicy(
      makeJob({
        workAuthorization: "unknown",
      }),
      { ...profile, workAuthorizationStatus: "unknown" },
    );
    const allowed = evaluatePolicy(
      makeJob({
        workAuthorization: "unknown",
      }),
      profile,
    );

    expect(blocked.allowed).toBe(false);
    expect(blocked.reasons).toContain("Work authorization is unknown.");
    expect(allowed.allowed).toBe(true);
  });

  it("treats more than two open questions as blocking, but not exactly two", () => {
    const okay = evaluatePolicy(
      makeJob({
        openQuestionsCount: 2,
      }),
      profile,
    );
    const blocked = evaluatePolicy(
      makeJob({
        openQuestionsCount: 3,
      }),
      profile,
    );

    expect(okay.allowed).toBe(true);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reasons).toContain("Too many open questions: 3.");
  });

  it("rejects missing required fields and includes all missing fields in order", () => {
    const result = evaluatePolicy(
      makeJob({
        title: null,
        company: null,
        location: null,
      }),
      profile,
    );

    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("Missing required fields: title, company, location.");
  });

  it("rejects linkedin jobs that are not easy apply in this phase", () => {
    const result = evaluatePolicy(
      makeJob({
        platform: "linkedin",
        applicationType: "external",
      }),
      profile,
    );

    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("Only LinkedIn Easy Apply jobs are allowed in this phase.");
  });

  it("rejects disallowed role families from profile negatives", () => {
    const result = evaluatePolicy(
      makeJob({
        title: "iOS Developer (English required)",
        technologies: ["Swift"],
        mustHaveSkills: [],
      }),
      profile,
    );

    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("Role family excluded by profile: ios.");
  });

  it("rejects pure Java roles without target stack overlap", () => {
    const result = evaluatePolicy(
      makeJob({
        title: "Java Developer",
        mustHaveSkills: ["Java"],
        technologies: ["Java", "Spring"],
        platform: "linkedin",
        applicationType: "easy_apply",
      }),
      profile,
    );

    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain(
      "Role family excluded by profile: pure Java role without target stack overlap.",
    );
  });

  it("allows Java roles when they overlap with frontend/full-stack target signals", () => {
    const result = evaluatePolicy(
      makeJob({
        title: "Java Developer (React/Java stack)",
        mustHaveSkills: ["Java", "React"],
        technologies: ["Java", "React", "TypeScript"],
        platform: "linkedin",
        applicationType: "easy_apply",
      }),
      profile,
    );

    expect(result.allowed).toBe(true);
    expect(
      result.reasons.some((reason) =>
        reason.includes("pure Java role without target stack overlap"),
      ),
    ).toBe(false);
  });

  it("handles excluded location checks case-insensitively", () => {
    const result = evaluatePolicy(
      makeJob({
        location: "ISTANBUL ONSITE",
        remoteType: "onsite",
      }),
      profile,
    );

    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "Location excluded by profile: Istanbul onsite.",
        "On-site roles are blocked by profile.",
      ]),
    );
  });

  it("matches configured bypass by explicit country name when configured directly", () => {
    const directCountryProfile = {
      ...profile,
      workplacePolicyBypassLocations: ["netherlands"],
    };

    expect(
      shouldBypassWorkplacePolicy(
        makeJob({
          location: "Rotterdam, Netherlands",
        }),
        directCountryProfile,
      ),
    ).toBe(true);
  });

  it("keeps reason ordering stable across platform, role, location, authorization, and quality checks", () => {
    const result = evaluatePolicy(
      makeJob({
        title: "Lead Java Developer",
        location: "Istanbul onsite",
        remoteType: "onsite",
        technologies: ["Java", "Spring Boot"],
        mustHaveSkills: ["Java"],
        niceToHaveSkills: [],
        platform: "linkedin",
        applicationType: "external",
        visaSponsorship: "no",
        openQuestionsCount: 4,
      }),
      { ...profile, workAuthorizationStatus: "unknown", excludedRoles: ["Lead"] },
    );

    expect(result.reasons).toEqual([
      "Only LinkedIn Easy Apply jobs are allowed in this phase.",
      "Role excluded by profile: Lead.",
      "Role family excluded by profile: pure Java role without target stack overlap.",
      "Location excluded by profile: Istanbul onsite.",
      "On-site roles are blocked by profile.",
      "Visa sponsorship mismatch.",
      "Too many open questions: 4.",
    ]);
  });
});
