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
  disallowedRoleKeywords: [
    "sap",
    "abap",
    "sapui5",
    "ios",
    "android",
    "mechanical",
    "researcher",
    "test",
    "qa",
    "qc",
    "php",
    "java",
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

const actualProfile = {
  yearsOfExperience: 3,
  preferredRoles: [
    "Backend Engineer",
    "Software Engineer",
    "Full Stack Engineer",
    "Full Stack Developer",
  ],
  preferredTechStack: [
    "TypeScript",
    "Node.js",
    "React",
    "Next.js",
    "Prisma",
    "PostgreSQL",
    "MongoDB",
    "API development",
    "microservices architecture",
    "CI/CD",
    "cloud infrastructure",
  ],
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
    "DevOps",
    "AWS",
    "Azure",
    "Google Cloud",
    "monitoring",
  ],
  preferredRoleOverlapSignals: [
    "frontend",
    "front-end",
    "full stack",
    "fullstack",
    "full-stack web applications",
    "back-end services",
    "back-end architectures",
    "api",
    "apis",
    "microservices",
    "scalability",
    "reliability",
    "ci/cd",
    "deployment",
    "monitoring",
    "cloud infrastructure",
    "code reviews",
  ],
  excludedRoles: ["Lead", "Staff", "Principal"],
  disallowedRoleKeywords: [
    "sap",
    "abap",
    "sapui5",
    "ios",
    "android",
    "mechanical",
    "researcher",
    "test",
    "qa",
    "qc",
    "php",
    "java",
  ],
  preferredLocations: ["Remote", "Europe", "Turkey"],
  excludedLocations: ["Istanbul onsite"],
  allowedHybridLocations: ["Ankara", "Izmir", "İzmir", "Eskişehir", "Eskisehir", "Samsun"],
  remotePreference: "remote",
  remoteOnly: true,
  visaRequirement: "not-required",
  workAuthorizationStatus: "authorized",
  languages: ["English"],
  salaryExpectation: "market",
  disability: {
    hasVisualDisability: false,
    disabilityPercentage: null,
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

    expect(hybridResult.breakdown.location).toBe(10);
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

  it("scores a deeply aligned remote full-stack role at 90+ for an exceptionally strong profile match", () => {
    const exceptionalProfile = {
      yearsOfExperience: 4,
      preferredRoles: [
        "Full Stack Engineer",
        "Full Stack Developer",
        "Software Engineer",
        "Backend Engineer",
      ],
      preferredTechStack: [
        "TypeScript",
        "Node.js",
        "React",
        "Next.js",
        "Prisma",
        "PostgreSQL",
        "API development",
        "microservices",
        "CI/CD",
        "cloud infrastructure",
        "Docker",
        "AWS",
      ],
      aspirationalTechStack: [
        "OpenAI",
        "LLM APIs",
        "Python",
        "monitoring",
        "Azure",
      ],
      preferredRoleOverlapSignals: [
        "full stack",
        "full-stack",
        "backend",
        "frontend",
        "api",
        "microservices",
        "scalability",
        "reliability",
        "ci/cd",
        "deployment",
        "monitoring",
        "cloud infrastructure",
        "code reviews",
      ],
      excludedRoles: ["Lead", "Staff", "Principal"],
      preferredLocations: ["Remote", "Europe"],
      excludedLocations: ["Istanbul onsite"],
      allowedHybridLocations: ["Ankara", "Izmir", "EskiÅŸehir", "Eskisehir", "Samsun"],
      remotePreference: "remote",
      remoteOnly: true,
      visaRequirement: "not-required",
      workAuthorizationStatus: "authorized",
      languages: ["English"],
      salaryExpectation: "market",
      disability: {
        hasVisualDisability: false,
        disabilityPercentage: null,
        requiresAccommodation: null,
        accommodationNotes: null,
        disclosurePreference: "manual-review",
      },
    } as const;

    const result = scoreJob(
      {
        title: "Senior Full Stack Engineer",
        company: "Acme Cloud",
        location: "Remote - Europe",
        remoteType: "remote",
        seniority: "mid",
        mustHaveSkills: [
          "TypeScript",
          "Node.js",
          "React",
          "Next.js",
          "Prisma",
          "PostgreSQL",
          "API development",
          "microservices",
          "CI/CD",
          "AWS",
        ],
        niceToHaveSkills: [
          "Docker",
          "cloud infrastructure",
          "monitoring",
          "OpenAI",
          "LLM APIs",
          "code reviews",
        ],
        technologies: [
          "TypeScript",
          "Node.js",
          "React",
          "Next.js",
          "Prisma",
          "PostgreSQL",
          "API development",
          "microservices",
          "CI/CD",
          "Docker",
          "AWS",
          "cloud infrastructure",
          "monitoring",
          "OpenAI",
          "LLM APIs",
        ],
        yearsRequired: 4,
        platform: "linkedin",
        applicationType: "easy_apply",
        visaSponsorship: "no",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      exceptionalProfile,
    );

    expect(result.totalScore).toBeGreaterThanOrEqual(90);
  });

  it("drops a CEIBA-like hybrid external role after remote inflation is removed", () => {
    const result = scoreJob(
      {
        title: "Full Stack Engineer",
        company: "CEIBA TELE ICU",
        location: "Istanbul / Maslak",
        remoteType: "hybrid",
        seniority: "mid",
        mustHaveSkills: [
          "JavaScript",
          "TypeScript",
          "Node.js",
          "Java",
          "React",
          "Linux",
          "AWS",
          "Azure",
        ],
        niceToHaveSkills: ["PostgreSQL", "Docker", "microservices"],
        technologies: [
          "JavaScript",
          "TypeScript",
          "Node.js",
          "Java",
          "React",
          "Linux",
          "AWS",
          "Azure",
          "PostgreSQL",
          "Docker",
        ],
        yearsRequired: 2,
        platform: "linkedin",
        applicationType: "external",
        visaSponsorship: "unknown",
        workAuthorization: "unknown",
        openQuestionsCount: 0,
      },
      profile,
    );

    expect(result.totalScore).toBeLessThanOrEqual(30);
    expect(result.breakdown.location).toBe(2);
    expect(result.breakdown.bonus).toBeLessThan(0);
  });

  it("heavily penalizes QA and testing-oriented roles even when the title still says software engineer", () => {
    const result = scoreJob(
      {
        title: "Junior Software Engineer - AI Quality & Testing",
        company: "Example AI",
        location: "Remote",
        remoteType: "remote",
        seniority: "junior",
        mustHaveSkills: ["Python", "test automation", "quality engineering"],
        niceToHaveSkills: ["OpenAI"],
        technologies: ["Python", "OpenAI", "pytest", "test automation"],
        yearsRequired: 1,
        platform: "linkedin",
        applicationType: "easy_apply",
        visaSponsorship: "unknown",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      profile,
    );

    expect(result.totalScore).toBeLessThan(35);
    expect(result.breakdown.bonus).toBeLessThan(0);
  });

  it("penalizes founding roles with ownership-heavy scope", () => {
    const result = scoreJob(
      {
        title: "Founding Full-Stack Engineer",
        company: "Early Team",
        location: "Remote",
        remoteType: "remote",
        seniority: "mid",
        mustHaveSkills: ["TypeScript", "Node.js", "React"],
        niceToHaveSkills: ["microservices"],
        technologies: ["TypeScript", "Node.js", "React", "PostgreSQL"],
        yearsRequired: 3,
        platform: "linkedin",
        applicationType: "easy_apply",
        visaSponsorship: "unknown",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      profile,
    );

    expect(result.totalScore).toBeLessThanOrEqual(40);
    expect(result.breakdown.bonus).toBeLessThan(0);
  });

  it("keeps broad remote mid-level roles from landing in the high-score bucket on title match alone", () => {
    const result = scoreJob(
      {
        title: "Software Engineer (Remote)",
        company: "Generic Platform",
        location: "Remote",
        remoteType: "remote",
        seniority: "mid",
        mustHaveSkills: ["communication"],
        niceToHaveSkills: ["team player"],
        technologies: ["Jira"],
        yearsRequired: 3,
        platform: "linkedin",
        applicationType: "easy_apply",
        visaSponsorship: "unknown",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      profile,
    );

    expect(result.totalScore).toBeLessThanOrEqual(35);
    expect(result.breakdown.location).toBeLessThan(20);
    expect(result.breakdown.seniority).toBeLessThan(20);
  });

  it.each([
    [
      "80-100",
      {
        title: "Backend Engineer",
        company: "Band Corp",
        location: "Remote",
        remoteType: "remote",
        seniority: "mid",
        mustHaveSkills: ["TypeScript"],
        niceToHaveSkills: ["Docker"],
        technologies: ["TypeScript"],
        yearsRequired: 3,
        platform: "linkedin",
        applicationType: "easy_apply",
        visaSponsorship: "unknown",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      80,
      101,
    ],
    [
      "70-90",
      {
        title: "Backend Engineer",
        company: "Band Corp",
        location: "Remote",
        remoteType: "remote",
        seniority: "mid",
        mustHaveSkills: ["TypeScript"],
        niceToHaveSkills: ["Docker"],
        technologies: ["Python", "Docker"],
        yearsRequired: 3,
        platform: "linkedin",
        applicationType: "easy_apply",
        visaSponsorship: "unknown",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      70,
      90,
    ],
    [
      "60-80",
      {
        title: "Backend Engineer",
        company: "Band Corp",
        location: "Remote",
        remoteType: "remote",
        seniority: "mid",
        mustHaveSkills: ["Python"],
        niceToHaveSkills: ["Docker"],
        technologies: ["TypeScript"],
        yearsRequired: 3,
        platform: "linkedin",
        applicationType: "easy_apply",
        visaSponsorship: "unknown",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      60,
      80,
    ],
    [
      "50-70",
      {
        title: "Backend Engineer",
        company: "Band Corp",
        location: "Remote",
        remoteType: "remote",
        seniority: "mid",
        mustHaveSkills: [],
        niceToHaveSkills: [],
        technologies: ["Docker", "CI/CD"],
        yearsRequired: 3,
        platform: "linkedin",
        applicationType: "easy_apply",
        visaSponsorship: "unknown",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      50,
      70,
    ],
    [
      "40-60",
      {
        title: "Platform Developer",
        company: "Band Corp",
        location: "Remote",
        remoteType: "remote",
        seniority: "senior",
        mustHaveSkills: ["TypeScript"],
        niceToHaveSkills: ["CI/CD"],
        technologies: ["Java"],
        yearsRequired: 5,
        platform: "linkedin",
        applicationType: "easy_apply",
        visaSponsorship: "unknown",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      40,
      60,
    ],
    [
      "30-50",
      {
        title: "Backend Engineer",
        company: "Band Corp",
        location: "Remote",
        remoteType: "hybrid",
        seniority: "mid",
        mustHaveSkills: [],
        niceToHaveSkills: [],
        technologies: ["Python", "Docker"],
        yearsRequired: 3,
        platform: "linkedin",
        applicationType: "easy_apply",
        visaSponsorship: "unknown",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      30,
      50,
    ],
    [
      "20-40",
      {
        title: "Backend Engineer",
        company: "Band Corp",
        location: "Remote",
        remoteType: "hybrid",
        seniority: "mid",
        mustHaveSkills: [],
        niceToHaveSkills: ["Docker"],
        technologies: [],
        yearsRequired: 3,
        platform: "linkedin",
        applicationType: "easy_apply",
        visaSponsorship: "unknown",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      20,
      40,
    ],
    [
      "10-30",
      {
        title: "Backend Engineer",
        company: "Band Corp",
        location: "Remote",
        remoteType: "hybrid",
        seniority: "senior",
        mustHaveSkills: ["Python"],
        niceToHaveSkills: ["Prisma"],
        technologies: ["Java"],
        yearsRequired: 5,
        platform: "linkedin",
        applicationType: "easy_apply",
        visaSponsorship: "unknown",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      10,
      30,
    ],
  ])("keeps a representative %s scoring band stable", (_label, job, minScore, maxExclusive) => {
    const result = scoreJob(job, profile);

    expect(result.totalScore).toBeGreaterThanOrEqual(minScore);
    expect(result.totalScore).toBeLessThan(maxExclusive);
  });

  it.each([
    [
      "turing remote full-stack",
      {
        title: "Remote Full-Stack Developer",
        company: "Turing",
        location: "Remote",
        remoteType: "remote",
        seniority: "unknown",
        mustHaveSkills: [
          "JavaScript",
          "TypeScript",
          "Node.js",
          "React",
          "full-stack development",
        ],
        niceToHaveSkills: ["Vue.js", "Angular"],
        technologies: ["JavaScript", "TypeScript", "Node.js", "React", "Nest.js"],
        yearsRequired: 2,
        platform: "linkedin",
        applicationType: "easy_apply",
        visaSponsorship: "unknown",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      50,
      60,
    ],
    [
      "jobs ai remote full-stack",
      {
        title: "Full Stack Developer (Remote)",
        company: "Jobs Ai",
        location: "Remote",
        remoteType: "remote",
        seniority: "unknown",
        mustHaveSkills: [
          "React",
          "Node.js",
          "SQL",
          "REST or GraphQL API design experience",
        ],
        niceToHaveSkills: ["Next.js", "MongoDB"],
        technologies: [
          "React",
          "Next.js",
          "TypeScript",
          "Node.js",
          "PostgreSQL",
          "MongoDB",
        ],
        yearsRequired: 2,
        platform: "linkedin",
        applicationType: "easy_apply",
        visaSponsorship: "unknown",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      65,
      75,
    ],
    [
      "frontend vue remote",
      {
        title: "Frontend Developer - Vue.js (Mid)",
        company: "Insider One",
        location: "Remote",
        remoteType: "remote",
        seniority: "mid",
        mustHaveSkills: ["Vue.js", "TypeScript", "Node.js"],
        niceToHaveSkills: ["AWS"],
        technologies: ["JavaScript", "TypeScript", "Vue.js", "Node.js", "Vite"],
        yearsRequired: 3,
        platform: "linkedin",
        applicationType: "easy_apply",
        visaSponsorship: "unknown",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      60,
      70,
    ],
    [
      "fintech remote europe generic stack",
      {
        title: "Software Developer - FinTech (Remote/Europe)",
        company: "Flisher + Partners",
        location: "Remote - Europe",
        remoteType: "remote",
        seniority: "mid",
        mustHaveSkills: ["programming languages", "relational databases", "debugging"],
        niceToHaveSkills: ["APIs"],
        technologies: ["relational databases", "APIs"],
        yearsRequired: 3,
        platform: "linkedin",
        applicationType: "external",
        visaSponsorship: "unknown",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      30,
      40,
    ],
    [
      "java hybrid istanbul",
      {
        title: "Fullstack Developer (Java&React)",
        company: "Amaris Consulting",
        location: "Greater Istanbul",
        remoteType: "hybrid",
        seniority: "unknown",
        mustHaveSkills: ["Java", "Spring", "Hibernate", "RESTful", "Oracle", "PL/SQL"],
        niceToHaveSkills: ["React"],
        technologies: ["Java", "Spring", "Hibernate", "RESTful", "Oracle", "PL/SQL", "React"],
        yearsRequired: 3,
        platform: "linkedin",
        applicationType: "external",
        visaSponsorship: "unknown",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      0,
      10,
    ],
    [
      "android senior hybrid",
      {
        title: "Senior Software Developer (Android)",
        company: "adesso Turkey",
        location: "Istanbul, Türkiye",
        remoteType: "hybrid",
        seniority: "senior",
        mustHaveSkills: ["Kotlin", "Jetpack Compose", "Android SDK", "RESTful APIs"],
        niceToHaveSkills: ["WebSockets"],
        technologies: [
          "Kotlin",
          "Jetpack Compose",
          "Android SDK",
          "RESTful APIs",
          "GraphQL APIs",
        ],
        yearsRequired: 5,
        platform: "linkedin",
        applicationType: "external",
        visaSponsorship: "unknown",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      0,
      5,
    ],
    [
      "onsite ai full-stack",
      {
        title: "Full Stack Developer",
        company: "Cronom",
        location: "On-site",
        remoteType: "onsite",
        seniority: "unknown",
        mustHaveSkills: ["Python", "FastAPI", "React", "Next.js", "PostgreSQL", "Docker"],
        niceToHaveSkills: ["Redis"],
        technologies: ["Python", "FastAPI", "React", "Next.js", "PostgreSQL", "Docker", "Redis"],
        yearsRequired: 3,
        platform: "linkedin",
        applicationType: "external",
        visaSponsorship: "unknown",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      30,
      45,
    ],
    [
      "senior go relocation remote",
      {
        title: "Senior Go Language Developer (relocation to Hungary)",
        company: "EPAM Systems",
        location: "Remote",
        remoteType: "remote",
        seniority: "senior",
        mustHaveSkills: [
          "Golang",
          "REST API development",
          "gRPC",
          "CI/CD pipelines",
          "Distributed systems",
        ],
        niceToHaveSkills: ["Cloud-native development"],
        technologies: ["Golang", "REST", "gRPC", "CI/CD", "OAuth"],
        yearsRequired: 5,
        platform: "linkedin",
        applicationType: "external",
        visaSponsorship: "unknown",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      25,
      35,
    ],
    [
      "rollic go python istanbul",
      {
        title: "Software Engineer",
        company: "Rollic",
        location: "Istanbul, Türkiye",
        remoteType: "unknown",
        seniority: "mid",
        mustHaveSkills: ["Go", "Python", "AWS", "Kubernetes", "distributed systems"],
        niceToHaveSkills: ["React"],
        technologies: ["Go", "Python", "AWS", "Kubernetes", "React"],
        yearsRequired: 3,
        platform: "linkedin",
        applicationType: "external",
        visaSponsorship: "unknown",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      40,
      45,
    ],
    [
      "obss react hybrid istanbul",
      {
        title: "Frontend Developer (React)",
        company: "OBSS",
        location: "Istanbul, Türkiye",
        remoteType: "hybrid",
        seniority: "unknown",
        mustHaveSkills: ["React", "TypeScript", "JavaScript", "RESTful API integrations"],
        niceToHaveSkills: ["RxJS"],
        technologies: ["React", "TypeScript", "JavaScript", "RESTful APIs"],
        yearsRequired: 3,
        platform: "linkedin",
        applicationType: "external",
        visaSponsorship: "unknown",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      30,
      35,
    ],
  ])("keeps DB-derived %s case stable against the actual profile", (_label, job, minScore, maxExclusive) => {
    const result = scoreJob(job, actualProfile);

    expect(result.totalScore).toBeGreaterThanOrEqual(minScore);
    expect(result.totalScore).toBeLessThan(maxExclusive);
  });

  it("ranks DB-derived cases in the expected order for the actual profile", () => {
    const jobsAi = scoreJob(
      {
        title: "Full Stack Developer (Remote)",
        company: "Jobs Ai",
        location: "Remote",
        remoteType: "remote",
        seniority: "unknown",
        mustHaveSkills: [
          "React",
          "Node.js",
          "SQL",
          "REST or GraphQL API design experience",
        ],
        niceToHaveSkills: ["Next.js", "MongoDB"],
        technologies: [
          "React",
          "Next.js",
          "TypeScript",
          "Node.js",
          "PostgreSQL",
          "MongoDB",
        ],
        yearsRequired: 2,
        platform: "linkedin",
        applicationType: "easy_apply",
        visaSponsorship: "unknown",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      actualProfile,
    );
    const cronom = scoreJob(
      {
        title: "Full Stack Developer",
        company: "Cronom",
        location: "On-site",
        remoteType: "onsite",
        seniority: "unknown",
        mustHaveSkills: ["Python", "FastAPI", "React", "Next.js", "PostgreSQL", "Docker"],
        niceToHaveSkills: ["Redis"],
        technologies: ["Python", "FastAPI", "React", "Next.js", "PostgreSQL", "Docker", "Redis"],
        yearsRequired: 3,
        platform: "linkedin",
        applicationType: "external",
        visaSponsorship: "unknown",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      actualProfile,
    );
    const amaris = scoreJob(
      {
        title: "Fullstack Developer (Java&React)",
        company: "Amaris Consulting",
        location: "Greater Istanbul",
        remoteType: "hybrid",
        seniority: "unknown",
        mustHaveSkills: ["Java", "Spring", "Hibernate", "RESTful", "Oracle", "PL/SQL"],
        niceToHaveSkills: ["React"],
        technologies: ["Java", "Spring", "Hibernate", "RESTful", "Oracle", "PL/SQL", "React"],
        yearsRequired: 3,
        platform: "linkedin",
        applicationType: "external",
        visaSponsorship: "unknown",
        workAuthorization: "authorized",
        openQuestionsCount: 0,
      },
      actualProfile,
    );

    expect(jobsAi.totalScore).toBeGreaterThan(cronom.totalScore);
    expect(cronom.totalScore).toBeGreaterThan(amaris.totalScore);
  });
});
