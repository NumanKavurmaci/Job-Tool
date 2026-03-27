import { beforeEach, describe, expect, it, vi } from "vitest";

const completePromptMock = vi.fn();

vi.mock("../../src/llm/completePrompt.js", () => ({
  completePrompt: completePromptMock,
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
  experienceOverrides: {},
  salaryExpectations: {
    usd: "50000-60000 USD yearly",
    eur: "3000-3500 EUR net monthly",
    try: "120000-140000 TRY net monthly",
  },
  salaryExpectation: "Open to market-rate mid-level backend roles",
  workAuthorization: "EU",
  requiresSponsorship: false,
  willingToRelocate: false,
  remotePreference: "remote",
  remoteOnly: true,
  disability: {
    hasVisualDisability: true,
    disabilityPercentage: 46,
    requiresAccommodation: null,
    accommodationNotes: null,
    disclosurePreference: "manual-review",
  },
  education: [],
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

describe("resolveAiFallbackAnswer", () => {
  beforeEach(() => {
    vi.resetModules();
    completePromptMock.mockReset();
  });

  it("normalizes radio answers to an available option", async () => {
    completePromptMock.mockResolvedValue({
      text: JSON.stringify({
        answer: "prefer not to say",
        confidence: 0.5,
        notes: ["Accessibility answer inferred from profile settings."],
      }),
      provider: "local",
      model: "openai/gpt-oss-20b",
    });

    const { resolveAiFallbackAnswer } = await import(
      "../../src/questions/strategies/aiFallback.js"
    );

    const result = await resolveAiFallbackAnswer({
      question: {
        label: "Disability status",
        inputType: "radio",
        options: ["Yes", "No", "Prefer not to say"],
      },
      classified: {
        type: "accessibility",
        normalizedText: "disability status",
        confidence: 0.4,
      },
      candidateProfile: profile,
      previousAttempt: {
        questionType: "accessibility",
        strategy: "needs-review",
        answer: null,
        confidence: 0,
        confidenceLabel: "manual_review",
        source: "manual",
      },
    });

    expect(result.strategy).toBe("generated");
    expect(result.answer).toBe("Prefer not to say");
    expect(result.source).toBe("llm");
  });

  it("preserves boolean checkbox answers from the LLM fallback", async () => {
    completePromptMock.mockResolvedValue({
      text: JSON.stringify({
        answer: true,
        confidence: 0.61,
      }),
      provider: "local",
      model: "openai/gpt-oss-20b",
    });

    const { resolveAiFallbackAnswer } = await import(
      "../../src/questions/strategies/aiFallback.js"
    );

    const result = await resolveAiFallbackAnswer({
      question: {
        label: "Are you willing to relocate?",
        inputType: "checkbox",
      },
      classified: {
        type: "relocation",
        normalizedText: "are you willing to relocate",
        confidence: 0.5,
      },
      candidateProfile: profile,
    });

    expect(result.answer).toBe(true);
    expect(result.confidenceLabel).toBe("medium");
  });

  it("keeps exact select option matches and clamps high confidence", async () => {
    completePromptMock.mockResolvedValue({
      text: JSON.stringify({
        answer: "No",
        confidence: 0.99,
        notes: [],
      }),
      provider: "local",
      model: "openai/gpt-oss-20b",
    });

    const { resolveAiFallbackAnswer } = await import(
      "../../src/questions/strategies/aiFallback.js"
    );

    const result = await resolveAiFallbackAnswer({
      question: {
        label: "Do you require sponsorship?",
        inputType: "select",
        options: ["Yes", "No"],
      },
      classified: {
        type: "sponsorship",
        normalizedText: "do you require sponsorship",
        confidence: 0.5,
      },
      candidateProfile: profile,
      job: {
        title: "Backend Engineer",
        company: "Acme",
        location: "Remote",
      },
    });

    expect(result.answer).toBe("No");
    expect(result.confidence).toBe(0.75);
  });

  it("preserves boolean answers for radio inputs", async () => {
    completePromptMock.mockResolvedValue({
      text: JSON.stringify({
        answer: false,
        confidence: 0.6,
      }),
      provider: "local",
      model: "openai/gpt-oss-20b",
    });

    const { resolveAiFallbackAnswer } = await import(
      "../../src/questions/strategies/aiFallback.js"
    );

    const result = await resolveAiFallbackAnswer({
      question: {
        label: "Do you require sponsorship?",
        inputType: "radio",
        options: ["Yes", "No"],
      },
      classified: {
        type: "sponsorship",
        normalizedText: "do you require sponsorship",
        confidence: 0.5,
      },
      candidateProfile: profile,
    });

    expect(result.answer).toBe(false);
  });

  it("falls back to partial option matching when no exact match exists", async () => {
    completePromptMock.mockResolvedValue({
      text: JSON.stringify({
        answer: "prefer",
        confidence: 0.57,
      }),
      provider: "local",
      model: "openai/gpt-oss-20b",
    });

    const { resolveAiFallbackAnswer } = await import(
      "../../src/questions/strategies/aiFallback.js"
    );

    const result = await resolveAiFallbackAnswer({
      question: {
        label: "Accessibility disclosure",
        inputType: "select",
        options: ["Yes", "No", "Prefer not to say"],
      },
      classified: {
        type: "accessibility",
        normalizedText: "accessibility disclosure",
        confidence: 0.5,
      },
      candidateProfile: profile,
    });

    expect(result.answer).toBe("Prefer not to say");
  });

  it("converts checkbox string answers into booleans", async () => {
    completePromptMock.mockResolvedValue({
      text: JSON.stringify({
        answer: "yes",
      }),
      provider: "local",
      model: "openai/gpt-oss-20b",
    });

    const { resolveAiFallbackAnswer } = await import(
      "../../src/questions/strategies/aiFallback.js"
    );

    const result = await resolveAiFallbackAnswer({
      question: {
        label: "Can you work weekends if needed?",
        inputType: "checkbox",
      },
      classified: {
        type: "unknown",
        normalizedText: "can you work weekends if needed",
        confidence: 0.3,
      },
      candidateProfile: profile,
    });

    expect(result.answer).toBe(true);
    expect(result.confidence).toBe(0.58);
  });

  it("keeps null answers when the fallback cannot answer", async () => {
    completePromptMock.mockResolvedValue({
      text: JSON.stringify({
        answer: null,
        confidence: 0.1,
      }),
      provider: "local",
      model: "openai/gpt-oss-20b",
    });

    const { resolveAiFallbackAnswer } = await import(
      "../../src/questions/strategies/aiFallback.js"
    );

    const result = await resolveAiFallbackAnswer({
      question: {
        label: "Unknown freeform question",
        inputType: "text",
      },
      classified: {
        type: "unknown",
        normalizedText: "unknown freeform question",
        confidence: 0.1,
      },
      candidateProfile: {
        ...profile,
        skills: [],
        preferredTechStack: [],
        languages: [],
        experience: [],
        resumeText: "",
      },
    });

    expect(result.answer).toBeNull();
    expect(result.confidence).toBe(0.2);
    expect(result.notes?.[0]).toContain("AI fallback");
  });

  it("trims plain text answers for text inputs", async () => {
    completePromptMock.mockResolvedValue({
      text: JSON.stringify({
        answer: "  0  ",
        confidence: 0.44,
      }),
      provider: "local",
      model: "openai/gpt-oss-20b",
    });

    const { resolveAiFallbackAnswer } = await import(
      "../../src/questions/strategies/aiFallback.js"
    );

    const result = await resolveAiFallbackAnswer({
      question: {
        label: "How many years of experience do you have with C++?",
        inputType: "text",
      },
      classified: {
        type: "years_of_experience",
        normalizedText: "how many years of experience do you have with c++",
        confidence: 0.4,
      },
      candidateProfile: profile,
      previousAttempt: {
        questionType: "years_of_experience",
        strategy: "needs-review",
        answer: null,
        confidence: 0,
        confidenceLabel: "manual_review",
        source: "manual",
        notes: ["Could not determine years confidently from resume."],
      },
    });

    expect(result.answer).toBe("0");
    expect(result.confidenceLabel).toBe("low");
  });
});
