import { describe, expect, it } from "vitest";
import { scoreJob } from "../../src/scoring/scoreJob.js";

const profile = {
  yearsOfExperience: 3,
  preferredRoles: ["Backend Engineer", "Software Engineer"],
  preferredTechStack: ["TypeScript", "Node.js", "Prisma", "PostgreSQL"],
  excludedRoles: ["Senior", "Staff", "Lead"],
  preferredLocations: ["Remote", "Europe"],
  excludedLocations: ["Istanbul onsite"],
  remotePreference: "remote",
  remoteOnly: true,
  visaRequirement: "not-required",
  workAuthorizationStatus: "authorized",
  languages: ["English"],
  salaryExpectation: "market",
  disability: {
    hasVisualDisability: true,
    disabilityPercentage: 46,
    requiresAccommodation: null,
    accommodationNotes: null,
    disclosurePreference: "manual-review",
  },
} as const;

describe("scoreJob", () => {
  it("produces a strong score for a good match", () => {
    const result = scoreJob(
      {
        title: "Backend Engineer",
        company: "Acme",
        location: "Remote - Europe",
        remoteType: "remote",
        seniority: "mid",
        mustHaveSkills: ["TypeScript", "Node.js"],
        niceToHaveSkills: ["Prisma"],
        technologies: ["TypeScript", "Node.js", "Prisma", "PostgreSQL"],
        yearsRequired: 3,
        platform: "greenhouse",
        visaSponsorship: "yes",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      profile,
    );

    expect(result.totalScore).toBeGreaterThanOrEqual(75);
    expect(result.breakdown.skill).toBeGreaterThan(0);
  });

  it("handles empty skills without crashing", () => {
    const result = scoreJob(
      {
        title: "Backend Engineer",
        company: "Acme",
        location: "Remote",
        remoteType: "unknown",
        seniority: "unknown",
        mustHaveSkills: [],
        niceToHaveSkills: [],
        technologies: [],
        yearsRequired: null,
        platform: "generic",
        visaSponsorship: "unknown",
        workAuthorization: "authorized",
        openQuestionsCount: 3,
      },
      profile,
    );

    expect(result.totalScore).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.skill).toBe(0);
  });

  it("penalizes senior and lead roles for a mid-level profile", () => {
    const seniorResult = scoreJob(
      {
        title: "Senior Backend Engineer",
        company: "Acme",
        location: "Remote",
        remoteType: "remote",
        seniority: "senior",
        mustHaveSkills: ["TypeScript"],
        niceToHaveSkills: [],
        technologies: ["TypeScript"],
        yearsRequired: 5,
        platform: "generic",
        visaSponsorship: "yes",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      profile,
    );
    const leadResult = scoreJob(
      {
        title: "Lead Backend Engineer",
        company: "Acme",
        location: "Remote",
        remoteType: "remote",
        seniority: "lead",
        mustHaveSkills: ["TypeScript"],
        niceToHaveSkills: [],
        technologies: ["TypeScript"],
        yearsRequired: 6,
        platform: "generic",
        visaSponsorship: "yes",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      profile,
    );

    expect(seniorResult.breakdown.seniority).toBe(3);
    expect(leadResult.breakdown.seniority).toBe(2);
  });

  it("scores staff and principal roles at zero seniority fit", () => {
    const staffResult = scoreJob(
      {
        title: "Staff Engineer",
        company: "Acme",
        location: "Remote",
        remoteType: "remote",
        seniority: "staff",
        mustHaveSkills: [],
        niceToHaveSkills: [],
        technologies: [],
        yearsRequired: 8,
        platform: "generic",
        visaSponsorship: "yes",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      profile,
    );

    const principalResult = scoreJob(
      {
        title: "Principal Engineer",
        company: "Acme",
        location: "Remote",
        remoteType: "remote",
        seniority: "principal",
        mustHaveSkills: [],
        niceToHaveSkills: [],
        technologies: [],
        yearsRequired: 9,
        platform: "generic",
        visaSponsorship: "yes",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      profile,
    );

    expect(staffResult.breakdown.seniority).toBe(0);
    expect(principalResult.breakdown.seniority).toBe(0);
  });

  it("covers hybrid, onsite, and preferred-location scoring branches", () => {
    const flexibleProfile = { ...profile, remoteOnly: false };
    const hybridResult = scoreJob(
      {
        title: "Backend Engineer",
        company: "Acme",
        location: "Berlin",
        remoteType: "hybrid",
        seniority: "mid",
        mustHaveSkills: [],
        niceToHaveSkills: [],
        technologies: [],
        yearsRequired: 3,
        platform: "generic",
        visaSponsorship: "yes",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      flexibleProfile,
    );
    const onsiteResult = scoreJob(
      {
        title: "Backend Engineer",
        company: "Acme",
        location: "Berlin",
        remoteType: "onsite",
        seniority: "mid",
        mustHaveSkills: [],
        niceToHaveSkills: [],
        technologies: [],
        yearsRequired: 3,
        platform: "generic",
        visaSponsorship: "yes",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      flexibleProfile,
    );
    const preferredLocationResult = scoreJob(
      {
        title: "Backend Engineer",
        company: "Acme",
        location: "Europe",
        remoteType: "flexible" as never,
        seniority: "mid",
        mustHaveSkills: [],
        niceToHaveSkills: [],
        technologies: [],
        yearsRequired: 3,
        platform: "generic",
        visaSponsorship: "yes",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      flexibleProfile,
    );

    expect(hybridResult.breakdown.location).toBe(12);
    expect(onsiteResult.breakdown.location).toBe(0);
    expect(preferredLocationResult.breakdown.location).toBe(16);
  });

  it("enforces remote-only scoring when configured", () => {
    const hybridResult = scoreJob(
      {
        title: "Backend Engineer",
        company: "Acme",
        location: "Berlin",
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

    expect(hybridResult.breakdown.location).toBe(0);
  });

  it("covers junior and intern scoring branches", () => {
    const juniorResult = scoreJob(
      {
        title: "Junior Backend Engineer",
        company: "Acme",
        location: "Remote",
        remoteType: "remote",
        seniority: "junior",
        mustHaveSkills: [],
        niceToHaveSkills: [],
        technologies: [],
        yearsRequired: 1,
        platform: "generic",
        visaSponsorship: "yes",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      profile,
    );
    const internResult = scoreJob(
      {
        title: "Software Engineering Intern",
        company: "Acme",
        location: "Remote",
        remoteType: "remote",
        seniority: "intern",
        mustHaveSkills: [],
        niceToHaveSkills: [],
        technologies: [],
        yearsRequired: 0,
        platform: "generic",
        visaSponsorship: "yes",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      { ...profile, yearsOfExperience: 0 },
    );

    expect(juniorResult.breakdown.seniority).toBe(18);
    expect(internResult.breakdown.seniority).toBe(12);
  });
});
