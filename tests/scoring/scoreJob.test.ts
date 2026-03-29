import { describe, expect, it } from "vitest";
import { scoreJob } from "../../src/scoring/scoreJob.js";

const profile = {
  yearsOfExperience: 3,
  preferredRoles: [
    "Backend Engineer",
    "Software Engineer",
    "Full Stack Engineer",
    "Full Stack Developer",
  ],
  preferredTechStack: ["TypeScript", "Node.js", "Prisma", "PostgreSQL"],
  aspirationalTechStack: [
    "Python",
    "LLM APIs",
    "OpenAI",
    "Azure OpenAI",
    "AIOps",
    "n8n",
    "Airflow",
    "Prefect",
    "Docker",
    "CI/CD",
    "Linux",
  ],
  excludedRoles: ["Senior", "Staff", "Lead"],
  preferredLocations: ["Remote", "Europe"],
  excludedLocations: ["Istanbul onsite"],
  allowedHybridLocations: ["Ankara", "Izmir", "Eskişehir", "Eskisehir", "Samsun"],
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

  it("covers hybrid, onsite, and unknown-location scoring branches", () => {
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

    expect(hybridResult.breakdown.location).toBe(2);
    expect(onsiteResult.breakdown.location).toBe(0);
    expect(preferredLocationResult.breakdown.location).toBe(8);
  });

  it("rewards hybrid roles only in configured cities", () => {
    const hybridResult = scoreJob(
      {
        title: "Backend Engineer",
        company: "Acme",
        location: "Ankara",
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
    const blockedHybridResult = scoreJob(
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

    expect(hybridResult.breakdown.location).toBe(14);
    expect(blockedHybridResult.breakdown.location).toBe(2);
  });

  it("gives partial credit for aspirational technologies without treating them as core experience", () => {
    const result = scoreJob(
      {
        title: "Software Engineer (AIOps)",
        company: "Bentego",
        location: "Türkiye",
        remoteType: "remote",
        seniority: "mid",
        mustHaveSkills: [
          "Python",
          "LLM APIs",
          "Linux environments",
          "Docker",
          "CI/CD pipelines",
        ],
        niceToHaveSkills: ["n8n", "Airflow", "OpenAI"],
        technologies: [
          "Python",
          "LLM APIs",
          "OpenAI",
          "Azure OpenAI",
          "Docker",
          "CI/CD",
          "Linux",
          "n8n",
          "Airflow",
        ],
        yearsRequired: 2,
        platform: "linkedin",
        applicationType: "easy_apply",
        visaSponsorship: "unknown",
        workAuthorization: "unknown",
        openQuestionsCount: 0,
      },
      profile,
    );

    expect(result.breakdown.skill).toBeGreaterThan(0);
    expect(result.breakdown.tech).toBeGreaterThan(0);
    expect(result.breakdown.bonus).toBeGreaterThan(0);
    expect(result.totalScore).toBeGreaterThanOrEqual(50);
    expect(result.totalScore).toBeLessThan(75);
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

  it("keeps deterministic role bonuses generic instead of favoring one role family", () => {
    const result = scoreJob(
      {
        title: "Full Stack Engineer",
        company: "Wide and Wise",
        location: "Türkiye",
        remoteType: "remote",
        seniority: "mid",
        mustHaveSkills: [
          "Node.js",
          "TypeScript",
          "React.js",
          "API development",
          "microservices architecture",
        ],
        niceToHaveSkills: [],
        technologies: [
          "Node.js",
          "TypeScript",
          "React.js",
          "API development",
          "microservices architecture",
          "PostgreSQL",
        ],
        yearsRequired: 3,
        platform: "linkedin",
        applicationType: "easy_apply",
        visaSponsorship: "unknown",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      profile,
    );

    expect(result.breakdown.bonus).toBe(4);
    expect(result.scoringSource).toBe("deterministic");
    expect(result.aiAdjustment).toBe(0);
  });

  it("tracks the raw deterministic baseline score on every score result", () => {
    const result = scoreJob(
      {
        title: "Full Stack Engineer",
        company: "Wide and Wise",
        location: "Türkiye",
        remoteType: "remote",
        seniority: "mid",
        mustHaveSkills: ["Node.js", "TypeScript", "React.js"],
        niceToHaveSkills: [],
        technologies: ["Node.js", "TypeScript", "React.js", "PostgreSQL"],
        yearsRequired: 3,
        platform: "linkedin",
        applicationType: "easy_apply",
        visaSponsorship: "unknown",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      profile,
    );

    expect(result.baselineScore).toBe(
      result.breakdown.skill +
        result.breakdown.seniority +
        result.breakdown.location +
        result.breakdown.tech +
        result.breakdown.bonus,
    );
  });
});
