import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveGeneratedAnswerMock = vi.fn();
const resolveAiFallbackAnswerMock = vi.fn();
const persistResolvedAnswerMock = vi.fn();
const readCachedResolvedAnswerMock = vi.fn();

vi.mock("../../src/questions/strategies/generated.js", () => ({
  resolveGeneratedAnswer: resolveGeneratedAnswerMock,
}));

vi.mock("../../src/questions/strategies/aiFallback.js", () => ({
  resolveAiFallbackAnswer: resolveAiFallbackAnswerMock,
}));

vi.mock("../../src/answers/cache.js", () => ({
  persistResolvedAnswer: persistResolvedAnswerMock,
  readCachedResolvedAnswer: readCachedResolvedAnswerMock,
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
  sourceMetadata: {
    resumePath: "./resume.txt",
  },
} as const;

describe("resolveAnswer", () => {
  beforeEach(() => {
    vi.resetModules();
    resolveGeneratedAnswerMock.mockReset();
    resolveAiFallbackAnswerMock.mockReset();
    persistResolvedAnswerMock.mockReset();
    readCachedResolvedAnswerMock.mockReset();
    readCachedResolvedAnswerMock.mockResolvedValue(null);
  });

  it("returns a cached database answer before running other strategies", async () => {
    readCachedResolvedAnswerMock.mockResolvedValue({
      normalizedQuestion: "linkedin profile",
      label: "LinkedIn Profile",
      questionType: "linkedin",
      strategy: "deterministic",
      answer: "https://linkedin.com/in/cached",
      confidenceLabel: "high",
      source: "candidate-profile",
      updatedAt: new Date().toISOString(),
    });

    const { resolveAnswer } = await import("../../src/answers/resolveAnswer.js");
    const result = await resolveAnswer({
      question: { label: "LinkedIn Profile", inputType: "text" },
      candidateProfile: profile,
    });

    expect(result.answer).toBe("https://linkedin.com/in/cached");
    expect(resolveGeneratedAnswerMock).not.toHaveBeenCalled();
    expect(resolveAiFallbackAnswerMock).not.toHaveBeenCalled();
    expect(persistResolvedAnswerMock).not.toHaveBeenCalled();
  });

  it("returns deterministic linkedin answers", async () => {
    const { resolveAnswer } = await import("../../src/answers/resolveAnswer.js");
    const result = await resolveAnswer({
      question: { label: "LinkedIn Profile", inputType: "text" },
      candidateProfile: profile,
    });

    expect(result.strategy).toBe("deterministic");
    expect(result.answer).toBe("https://linkedin.com/in/jane");
    expect(persistResolvedAnswerMock).toHaveBeenCalled();
  });

  it("returns the email address for email-style LinkedIn questions", async () => {
    const { resolveAnswer } = await import("../../src/answers/resolveAnswer.js");
    const result = await resolveAnswer({
      question: { label: "What is your email address?", inputType: "text" },
      candidateProfile: profile,
    });

    expect(result.strategy).toBe("deterministic");
    expect(result.answer).toBe("jane@example.com");
  });

  it("returns the phone number for phone-style LinkedIn questions", async () => {
    const { resolveAnswer } = await import("../../src/answers/resolveAnswer.js");
    const result = await resolveAnswer({
      question: { label: "What is your phone number?", inputType: "text" },
      candidateProfile: profile,
    });

    expect(result.strategy).toBe("deterministic");
    expect(result.answer).toBe("123");
  });

  it("returns first and last name answers for common LinkedIn profile fields", async () => {
    const { resolveAnswer } = await import("../../src/answers/resolveAnswer.js");

    const firstName = await resolveAnswer({
      question: { label: "First name", inputType: "text" },
      candidateProfile: profile,
    });

    const lastName = await resolveAnswer({
      question: { label: "Last name", inputType: "text" },
      candidateProfile: profile,
    });

    expect(firstName.answer).toBe("Jane");
    expect(lastName.answer).toBe("Doe");
  });

  it("returns deterministic answers for work authorization and relocation questions", async () => {
    const { resolveAnswer } = await import("../../src/answers/resolveAnswer.js");

    const workAuthorization = await resolveAnswer({
      question: {
        label: "Are you legally authorized to work in Germany?",
        inputType: "radio",
      },
      candidateProfile: profile,
    });

    const relocation = await resolveAnswer({
      question: {
        label: "Are you willing to relocate?",
        inputType: "radio",
      },
      candidateProfile: profile,
    });

    expect(workAuthorization.strategy).toBe("deterministic");
    expect(workAuthorization.answer).toBe("EU");
    expect(relocation.strategy).toBe("deterministic");
    expect(relocation.answer).toBe(true);
  });

  it("returns deterministic answers for GPA questions", async () => {
    const { resolveAnswer } = await import("../../src/answers/resolveAnswer.js");
    const result = await resolveAnswer({
      question: {
        label: "What is your GPA?",
        inputType: "text",
      },
      candidateProfile: profile,
    });

    expect(result.strategy).toBe("deterministic");
    expect(result.answer).toBe("2.4");
  });

  it("returns deterministic answers for remote-only work arrangement questions", async () => {
    const { resolveAnswer } = await import("../../src/answers/resolveAnswer.js");
    const remote = await resolveAnswer({
      question: {
        label: "Are you comfortable working remotely?",
        inputType: "radio",
      },
      candidateProfile: profile,
    });

    const hybrid = await resolveAnswer({
      question: {
        label: "Are you open to hybrid work?",
        inputType: "radio",
      },
      candidateProfile: profile,
    });

    expect(remote.answer).toBe(true);
    expect(hybrid.answer).toBe(false);
  });

  it("routes disability questions to the AI fallback when deterministic logic used to require manual review", async () => {
    resolveAiFallbackAnswerMock.mockResolvedValue({
      questionType: "accessibility",
      strategy: "generated",
      answer: "Prefer not to say",
      confidence: 0.56,
      confidenceLabel: "low",
      source: "llm",
    });

    const { resolveAnswer } = await import("../../src/answers/resolveAnswer.js");
    const result = await resolveAnswer({
      question: {
        label: "Do you identify as disabled or require accommodations?",
        inputType: "radio",
      },
      candidateProfile: profile,
    });

    expect(result.strategy).toBe("generated");
    expect(result.source).toBe("llm");
    expect(resolveAiFallbackAnswerMock).toHaveBeenCalled();
  });

  it("returns resume-derived answers for skill years questions", async () => {
    const { resolveAnswer } = await import("../../src/answers/resolveAnswer.js");
    const result = await resolveAnswer({
      question: {
        label: "How many years of experience do you have with React?",
        inputType: "text",
      },
      candidateProfile: profile,
    });

    expect(result.strategy).toBe("resume-derived");
  });

  it("uses configured numeric overrides for years-of-experience questions", async () => {
    const { resolveAnswer } = await import("../../src/answers/resolveAnswer.js");
    const result = await resolveAnswer({
      question: {
        label: "How many years of experience do you have with Linux environments, Docker, and CI/CD pipelines?",
        inputType: "text",
      },
      candidateProfile: profile,
    });

    expect(result.strategy).toBe("resume-derived");
    expect(result.answer).toBe("0");
  });

  it("returns zero years for unsupported technologies", async () => {
    const { resolveAnswer } = await import("../../src/answers/resolveAnswer.js");
    const result = await resolveAnswer({
      question: {
        label: "How many years of professional experience do you have working with Angular?",
        inputType: "text",
      },
      candidateProfile: profile,
    });

    expect(result.strategy).toBe("resume-derived");
    expect(result.answer).toBe("0");
    expect(result.confidenceLabel).toBe("medium");
  });

  it("routes motivation questions to the generated path", async () => {
    resolveGeneratedAnswerMock.mockResolvedValue({
      questionType: "motivation_short_text",
      strategy: "generated",
      answer: "I am interested because the role matches my backend experience.",
      confidence: 0.62,
      confidenceLabel: "medium",
      source: "llm",
    });

    const { resolveAnswer } = await import("../../src/answers/resolveAnswer.js");
    const result = await resolveAnswer({
      question: {
        label: "Why are you interested in this role?",
        inputType: "textarea",
      },
      candidateProfile: profile,
    });

    expect(result.strategy).toBe("generated");
  });

  it("returns deterministic answers for salary questions when the currency is configured", async () => {
    const { resolveAnswer } = await import("../../src/answers/resolveAnswer.js");
    const eurResult = await resolveAnswer({
      question: {
        label: "What is your salary expectation in EUR net after tax?",
        inputType: "text",
      },
      candidateProfile: profile,
    });

    const usdResult = await resolveAnswer({
      question: {
        label: "What is your salary expectation in USD?",
        inputType: "text",
      },
      candidateProfile: profile,
    });

    const tryResult = await resolveAnswer({
      question: {
        label: "What is your salary expectation in TL?",
        inputType: "text",
      },
      candidateProfile: profile,
    });

    expect(eurResult.strategy).toBe("deterministic");
    expect(eurResult.answer).toBe("3000-3500 EUR net monthly");
    expect(usdResult.answer).toBe("50000-60000 USD yearly");
    expect(tryResult.answer).toBe("120000-140000 TRY net monthly");
  });

  it("falls back to AI guidance when a required salary field is missing from the user profile", async () => {
    resolveAiFallbackAnswerMock.mockResolvedValue({
      questionType: "salary",
      strategy: "generated",
      answer: "Negotiable",
      confidence: 0.55,
      confidenceLabel: "low",
      source: "llm",
      notes: ["Profile salary field was missing."],
    });

    const { resolveAnswer } = await import("../../src/answers/resolveAnswer.js");
    const result = await resolveAnswer({
      question: {
        label: "What is your salary expectation in EUR net after tax?",
        inputType: "text",
      },
      candidateProfile: {
        ...profile,
        salaryExpectations: {
          ...profile.salaryExpectations,
          eur: null,
        },
      },
    });

    expect(result.strategy).toBe("generated");
    expect(result.answer).toBe("Negotiable");
    expect(resolveAiFallbackAnswerMock).toHaveBeenCalled();
  });

  it("uses the generic salary expectation when no currency is specified", async () => {
    const { resolveAnswer } = await import("../../src/answers/resolveAnswer.js");
    const result = await resolveAnswer({
      question: {
        label: "What is your net salary expectation for this position?",
        inputType: "text",
      },
      candidateProfile: profile,
    });

    expect(result.strategy).toBe("deterministic");
    expect(result.answer).toBe("Open to market-rate mid-level backend roles");
  });

  it("routes notice period questions to AI fallback", async () => {
    resolveAiFallbackAnswerMock.mockResolvedValue({
      questionType: "availability",
      strategy: "generated",
      answer: "Available with standard notice.",
      confidence: 0.52,
      confidenceLabel: "low",
      source: "llm",
    });

    const { resolveAnswer } = await import("../../src/answers/resolveAnswer.js");
    const result = await resolveAnswer({
      question: {
        label: "When can you start? What is your notice period?",
        inputType: "text",
      },
      candidateProfile: profile,
    });

    expect(result.strategy).toBe("generated");
    expect(result.source).toBe("llm");
  });

  it("persists zero-year unsupported technology answers to the cache layer", async () => {
    const { resolveAnswer } = await import("../../src/answers/resolveAnswer.js");
    await resolveAnswer({
      question: {
        label: "How many years of professional experience do you have working with Angular?",
        inputType: "text",
      },
      candidateProfile: profile,
    });

    expect(persistResolvedAnswerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        question: expect.objectContaining({
          label: "How many years of professional experience do you have working with Angular?",
        }),
        resolved: expect.objectContaining({
          answer: "0",
          confidenceLabel: "medium",
        }),
      }),
    );
  });

  it("falls back to AI when no other strategy resolves the question", async () => {
    resolveAiFallbackAnswerMock.mockResolvedValue({
      questionType: "unknown",
      strategy: "generated",
      answer: "No",
      confidence: 0.51,
      confidenceLabel: "low",
      source: "llm",
    });

    const { resolveAnswer } = await import("../../src/answers/resolveAnswer.js");
    const result = await resolveAnswer({
      question: {
        label: "Can you work night shifts if needed?",
        inputType: "radio",
        options: ["Yes", "No"],
      },
      candidateProfile: profile,
    });

    expect(result.strategy).toBe("generated");
    expect(result.answer).toBe("No");
    expect(resolveAiFallbackAnswerMock).toHaveBeenCalled();
  });
});
