import { beforeEach, describe, expect, it, vi } from "vitest";

const generateShortAnswerMock = vi.fn();

vi.mock("../../src/materials/generateShortAnswer.js", () => ({
  generateShortAnswer: generateShortAnswerMock,
}));

const profile = {
  fullName: "Jane Doe",
  email: "jane@example.com",
  phone: "123",
  location: "Berlin",
  linkedinUrl: "https://linkedin.com/in/jane",
  githubUrl: null,
  portfolioUrl: null,
  summary: "Backend engineer",
  gpa: 2.4,
  yearsOfExperienceTotal: 4,
  currentTitle: "Backend Engineer",
  preferredRoles: ["Backend Engineer"],
  preferredTechStack: ["TypeScript", "React", "Node.js"],
  skills: ["TypeScript", "React", "Node.js"],
  languages: ["English"],
  experienceOverrides: {
    linux: 0,
  },
  salaryExpectations: {
    usd: "50000-60000 USD yearly",
    eur: "3000-3500 EUR net monthly",
    try: "120000-140000 TRY net monthly",
  },
  salaryExpectation: "Open to market-rate mid-level backend roles",
  workAuthorization: "EU",
  requiresSponsorship: false,
  willingToRelocate: true,
  remotePreference: "remote",
  remoteOnly: true,
  disability: {
    hasVisualDisability: true,
    disabilityPercentage: 46,
    requiresAccommodation: null,
    accommodationNotes: null,
    disclosurePreference: "manual-review",
  },
  education: [
    {
      institution: "TU Berlin",
      degree: "BSc",
      fieldOfStudy: "Computer Science",
      startDate: null,
      endDate: null,
    },
  ],
  experience: [
    {
      company: "Acme",
      title: "Backend Engineer",
      summary: "Built React dashboards and Node APIs",
      technologies: ["React", "Node.js"],
      startDate: null,
      endDate: null,
    },
  ],
  projects: [],
  resumeText: "resume text",
  sourceMetadata: {},
} as const;

describe("question strategies", () => {
  beforeEach(() => {
    vi.resetModules();
    generateShortAnswerMock.mockReset();
  });

  it("resolves deterministic answers for linkedin and sponsorship", async () => {
    const { resolveDeterministicAnswer } = await import(
      "../../src/questions/strategies/deterministic.js"
    );

    expect(
      resolveDeterministicAnswer(
        { type: "linkedin", normalizedText: "linkedin", confidence: 0.9 },
        profile,
      )?.answer,
    ).toBe("https://linkedin.com/in/jane");

    expect(
      resolveDeterministicAnswer(
        { type: "sponsorship", normalizedText: "sponsorship", confidence: 0.9 },
        profile,
      )?.answer,
    ).toBe(false);

    expect(
      resolveDeterministicAnswer(
        { type: "contact_info", normalizedText: "email", confidence: 0.9 },
        profile,
      )?.answer,
    ).toBe("jane@example.com");

    expect(
      resolveDeterministicAnswer(
        { type: "contact_info", normalizedText: "first name", confidence: 0.9 },
        profile,
      )?.answer,
    ).toBe("Jane");

    expect(
      resolveDeterministicAnswer(
        { type: "contact_info", normalizedText: "last name", confidence: 0.9 },
        profile,
      )?.answer,
    ).toBe("Doe");

    expect(
      resolveDeterministicAnswer(
        { type: "work_authorization", normalizedText: "authorized to work", confidence: 0.9 },
        profile,
      )?.answer,
    ).toBe("EU");

    expect(
      resolveDeterministicAnswer(
        { type: "relocation", normalizedText: "relocate", confidence: 0.9 },
        profile,
      )?.answer,
    ).toBe(true);

    expect(
      resolveDeterministicAnswer(
        { type: "location", normalizedText: "location", confidence: 0.9 },
        profile,
      )?.answer,
    ).toBe("Berlin");

    expect(
      resolveDeterministicAnswer(
        { type: "gpa", normalizedText: "what is your gpa", confidence: 0.9 },
        profile,
      )?.answer,
    ).toBe("2.4");

    expect(
      resolveDeterministicAnswer(
        { type: "remote_preference", normalizedText: "are you comfortable working remotely", confidence: 0.9 },
        profile,
      )?.answer,
    ).toBe(true);
  });

  it("flags deterministic sponsorship as manual when unknown", async () => {
    const { resolveDeterministicAnswer } = await import(
      "../../src/questions/strategies/deterministic.js"
    );

    const result = resolveDeterministicAnswer(
      { type: "sponsorship", normalizedText: "sponsorship", confidence: 0.9 },
      { ...profile, requiresSponsorship: null },
    );

    expect(result?.confidenceLabel).toBe("manual_review");
  });

  it("returns null for unsupported deterministic question types", async () => {
    const { resolveDeterministicAnswer } = await import(
      "../../src/questions/strategies/deterministic.js"
    );
    expect(
      resolveDeterministicAnswer(
        { type: "unknown", normalizedText: "unknown", confidence: 0.2 },
        profile,
      ),
    ).toBeNull();
  });

  it("routes accessibility questions to manual review by default", async () => {
    const { resolveDeterministicAnswer } = await import(
      "../../src/questions/strategies/deterministic.js"
    );

    const result = resolveDeterministicAnswer(
      { type: "accessibility", normalizedText: "do you require reasonable accommodation", confidence: 0.9 },
      profile,
    );

    expect(result?.strategy).toBe("needs-review");
    expect(result?.confidenceLabel).toBe("manual_review");
  });

  it("returns prefer-not-to-say for accessibility questions when configured", async () => {
    const { resolveDeterministicAnswer } = await import(
      "../../src/questions/strategies/deterministic.js"
    );

    const result = resolveDeterministicAnswer(
      { type: "accessibility", normalizedText: "do you identify as disabled", confidence: 0.9 },
      {
        ...profile,
        disability: {
          ...profile.disability,
          disclosurePreference: "prefer-not-to-say",
        },
      },
    );

    expect(result?.answer).toBe("Prefer not to say");
  });

  it("returns disclosed accessibility answers when configured", async () => {
    const { resolveDeterministicAnswer } = await import(
      "../../src/questions/strategies/deterministic.js"
    );

    const disabilityResult = resolveDeterministicAnswer(
      { type: "accessibility", normalizedText: "do you identify as disabled", confidence: 0.9 },
      {
        ...profile,
        disability: {
          ...profile.disability,
          disclosurePreference: "disclose",
        },
      },
    );

    const accommodationResult = resolveDeterministicAnswer(
      { type: "accessibility", normalizedText: "do you require reasonable accommodation", confidence: 0.9 },
      {
        ...profile,
        disability: {
          ...profile.disability,
          disclosurePreference: "disclose",
          requiresAccommodation: true,
        },
      },
    );

    expect(disabilityResult?.answer).toBe(true);
    expect(accommodationResult?.answer).toBe(true);
  });

  it("resolves resume-aware answers for years, skills, and education", async () => {
    const { resolveResumeAwareAnswer } = await import(
      "../../src/questions/strategies/resumeAware.js"
    );

    expect(
      resolveResumeAwareAnswer(
        { type: "years_of_experience", normalizedText: "how many years of experience do you have with react", confidence: 0.9 },
        profile,
      )?.strategy,
    ).toBe("resume-derived");

    expect(
      resolveResumeAwareAnswer(
        { type: "years_of_experience", normalizedText: "how many years of work experience do you have with full-stack development", confidence: 0.9 },
        profile,
      )?.answer,
    ).toBe("4");

    expect(
      resolveResumeAwareAnswer(
        { type: "years_of_experience", normalizedText: "how many years of experience do you have with linux environments, docker, and ci/cd pipelines", confidence: 0.9 },
        profile,
      )?.answer,
    ).toBe("0");

    expect(
      resolveResumeAwareAnswer(
        { type: "skill_experience", normalizedText: "which frontend frameworks have you used", confidence: 0.9 },
        profile,
      )?.answer,
    ).toContain("React");

    expect(
      resolveResumeAwareAnswer(
        { type: "education", normalizedText: "what degree do you have", confidence: 0.9 },
        profile,
      )?.answer,
    ).toContain("TU Berlin");

    expect(
      resolveResumeAwareAnswer(
        { type: "unknown", normalizedText: "something else", confidence: 0.2 },
        profile,
      ),
    ).toBeNull();
  });

  it("keeps broad unmatched experience questions conservative when total experience is unknown", async () => {
    const { resolveResumeAwareAnswer } = await import(
      "../../src/questions/strategies/resumeAware.js"
    );

    const result = resolveResumeAwareAnswer(
      { type: "years_of_experience", normalizedText: "how many years of work experience do you have with full-stack development", confidence: 0.9 },
      { ...profile, yearsOfExperienceTotal: null },
    );

    expect(result?.confidenceLabel).toBe("manual_review");
  });

  it("returns zero years for unsupported technologies", async () => {
    const { resolveResumeAwareAnswer } = await import(
      "../../src/questions/strategies/resumeAware.js"
    );

    const result = resolveResumeAwareAnswer(
      { type: "years_of_experience", normalizedText: "how many years of professional experience do you have working with angular", confidence: 0.9 },
      profile,
    );

    expect(result?.answer).toBe("0");
    expect(result?.confidenceLabel).toBe("medium");
  });

  it("generates answers for short-text questions", async () => {
    generateShortAnswerMock.mockResolvedValue({
      text: "I am interested because the role fits my background.",
      confidence: 0.62,
      notes: ["Review before submitting."],
    });

    const { resolveGeneratedAnswer } = await import(
      "../../src/questions/strategies/generated.js"
    );
    const result = await resolveGeneratedAnswer(
      { type: "motivation_short_text", normalizedText: "why are you interested in this role", confidence: 0.9 },
      profile,
      { title: "Backend Engineer", company: "Acme", location: "Remote" },
    );

    expect(result?.strategy).toBe("generated");
    expect(result?.notes?.[0]).toContain("Review");
  });

  it("returns null for non-generated question types", async () => {
    const { resolveGeneratedAnswer } = await import(
      "../../src/questions/strategies/generated.js"
    );

    await expect(
      resolveGeneratedAnswer(
        { type: "linkedin", normalizedText: "linkedin", confidence: 0.9 },
        profile,
      ),
    ).resolves.toBeNull();
  });
});
