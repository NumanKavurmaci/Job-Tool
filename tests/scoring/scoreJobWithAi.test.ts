import { describe, expect, it, vi } from "vitest";
import { parseAiScoreAdjustment, scoreJobWithAi } from "../../src/scoring/scoreJobWithAi.js";

const profile = {
  yearsOfExperience: 3,
  preferredRoles: [
    "Backend Engineer",
    "Software Engineer",
    "Full Stack Engineer",
    "Full Stack Developer",
  ],
  preferredTechStack: ["TypeScript", "Node.js", "Prisma", "PostgreSQL", "React"],
  aspirationalTechStack: ["Docker", "CI/CD", "Linux", "Playwright", "Tailwind"],
  preferredRoleOverlapSignals: ["frontend", "front-end", "web applications", "ui"],
  excludedRoles: ["Lead", "Staff", "Principal"],
  disallowedRoleKeywords: [],
  preferredLocations: ["Remote", "Europe"],
  excludedLocations: [],
  allowedHybridLocations: ["Ankara"],
  remotePreference: "remote",
  remoteOnly: true,
  visaRequirement: "not-required",
  workAuthorizationStatus: "authorized",
  languages: ["English"],
  experienceOverrides: {},
  salaryExpectations: { usd: null, eur: null, try: null },
  gpa: null,
  salaryExpectation: null,
  disability: {
    hasVisualDisability: false,
    disabilityPercentage: null,
    requiresAccommodation: null,
    accommodationNotes: null,
    disclosurePreference: "manual-review" as const,
  },
};

const frontendJob = {
  title: "Senior Frontend Developer (React)",
  company: "Jobgether",
  location: "Remote",
  remoteType: "remote" as const,
  seniority: "senior" as const,
  mustHaveSkills: [
    "JavaScript",
    "TypeScript",
    "React",
    "TailwindCSS",
    "GraphQL",
    "Cypress",
    "Playwright",
  ],
  niceToHaveSkills: ["Storybook"],
  technologies: [
    "React",
    "JavaScript",
    "TypeScript",
    "TailwindCSS",
    "GraphQL",
    "Cypress",
    "Playwright",
    "Storybook",
  ],
  yearsRequired: 5,
  platform: "linkedin",
  applicationType: "easy_apply" as const,
  visaSponsorship: "unknown" as const,
  workAuthorization: "authorized" as const,
  openQuestionsCount: 0,
};

const altamiraJob = {
  title: "Full-Stack Developer (Node.js + React)",
  company: "Altamira",
  location: "Remote",
  remoteType: "remote" as const,
  seniority: "unknown" as const,
  mustHaveSkills: [
    "Deep hands-on experience with Node.js in production environments",
    "Strong knowledge of TypeScript and modern JavaScript",
    "Experience designing and implementing RESTful APIs",
    "Understanding of backend architecture patterns (layered architecture, modular design, separation of concerns)",
    "Solid understanding of asynchronous programming, the event loop, and performance considerations in Node.js",
    "Experience working with SQL databases, including query optimization, transactions, and migrations",
    "Knowledge of authentication and authorization mechanisms (JWT, OAuth, role-based access)",
    "Experience with error handling, logging, and monitoring in back-end services",
    "Ability to write maintainable and testable code (unit and integration tests)",
    "Practical experience working with PHP and Laravel in production environments",
    "Comfort working with and debugging legacy PHP/Laravel codebases",
    "Strong experience building complex applications with React",
    "Confident use of modern React patterns (hooks, context, controlled components)",
    "Experience with state management solutions (Redux, React Query, or similar)",
    "Ability to design and implement scalable component architectures",
    "Strong understanding of front-end performance optimization (memoization, rendering control, code splitting)",
    "Experience working with forms, validation, and complex UI state",
    "Knowledge of accessibility (a11y) and cross-browser compatibility",
    "Experience integrating front-end applications with APIs and handling asynchronous data flows",
    "Ability to maintain consistent UI/UX in large codebases",
  ],
  niceToHaveSkills: [],
  technologies: [
    "Node.js",
    "TypeScript",
    "JavaScript",
    "React",
    "PHP",
    "Laravel",
    "SQL",
    "RESTful APIs",
    "JWT",
    "OAuth",
    "Redux",
    "React Query",
    "HTML",
    "CSS",
    "Accessibility (a11y)",
  ],
  yearsRequired: 3,
  platform: "linkedin",
  applicationType: "external" as const,
  visaSponsorship: "unknown" as const,
  workAuthorization: "authorized" as const,
  openQuestionsCount: 2,
};

describe("scoreJobWithAi", () => {
  it("uses the AI returned score as the final score", async () => {
    const completePrompt = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        score: 78,
        rationale: "Strong React, TypeScript, UI, testing, and remote overlap for an adjacent role.",
        confidence: "high",
        breakdown: {
          skill: 24,
          seniority: 10,
          location: 16,
          tech: 18,
          bonus: 10,
        },
      }),
    });

    const result = await scoreJobWithAi({
      job: frontendJob,
      profile,
      completePrompt,
    });

    expect(completePrompt).toHaveBeenCalledTimes(1);
    expect(result.aiConfidence).toBe("high");
    expect(result.aiReasoning).toContain("Strong React");
    expect(result.scoringSource).toBe("llm");
    expect(result.totalScore).toBe(78);
    expect(result.breakdown).toEqual({
      skill: 24,
      seniority: 10,
      location: 16,
      tech: 18,
      bonus: 10,
    });
  });

  it("falls back to deterministic scoring when the AI response is invalid", async () => {
    const completePrompt = vi.fn().mockResolvedValue({
      text: "not json",
    });

    const result = await scoreJobWithAi({
      job: frontendJob,
      profile,
      completePrompt,
      logger: {
        warn: vi.fn(),
      },
    });

    expect(result.scoringSource).toBe("deterministic");
    expect(result.totalScore).toBe(result.baselineScore);
  });

  it("lets the Altamira full-stack role cross the apply threshold when AI confirms the strong primary stack fit", async () => {
    const altamiraProfile = {
      ...profile,
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
    };
    const completePrompt = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        score: 56,
        rationale:
          "Strong Node.js, TypeScript, React, remote, and API overlap outweigh the secondary PHP/Laravel maintenance requirements.",
        confidence: "medium",
        breakdown: {
          skill: 18,
          seniority: 8,
          location: 16,
          tech: 8,
          bonus: 6,
        },
      }),
    });

    const result = await scoreJobWithAi({
      job: altamiraJob,
      profile: altamiraProfile,
      completePrompt,
    });

    expect(result.scoringSource).toBe("llm");
    expect(result.totalScore).toBeGreaterThanOrEqual(50);
  });
});

describe("parseAiScoreAdjustment", () => {
  it("clamps extreme AI scores into the allowed range", () => {
    const parsed = parseAiScoreAdjustment(
      JSON.stringify({
        score: 999,
        rationale: "Too high.",
        confidence: "high",
      }),
    );

    expect(parsed.score).toBe(100);
  });
});
