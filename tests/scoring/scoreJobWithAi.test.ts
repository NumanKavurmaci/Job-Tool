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

describe("scoreJobWithAi", () => {
  it("applies a bounded AI adjustment for semantically strong adjacent roles", async () => {
    const completePrompt = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        adjustment: 12,
        rationale: "Strong React, TypeScript, UI, testing, and remote overlap for an adjacent role.",
        confidence: "high",
      }),
    });

    const result = await scoreJobWithAi({
      job: frontendJob,
      profile,
      completePrompt,
    });

    expect(completePrompt).toHaveBeenCalledTimes(1);
    expect(result.aiAdjustment).toBe(12);
    expect(result.aiConfidence).toBe("high");
    expect(result.aiReasoning).toContain("Strong React");
    expect(result.scoringSource).toBe("deterministic+ai");
    expect(result.totalScore).toBe((result.baselineScore ?? 0) + 12);
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
    expect(result.aiAdjustment).toBe(0);
    expect(result.totalScore).toBe(result.baselineScore);
  });
});

describe("parseAiScoreAdjustment", () => {
  it("clamps extreme AI adjustments into the allowed range", () => {
    const parsed = parseAiScoreAdjustment(
      JSON.stringify({
        adjustment: 99,
        rationale: "Too high.",
        confidence: "high",
      }),
    );

    expect(parsed.adjustment).toBe(15);
  });
});
