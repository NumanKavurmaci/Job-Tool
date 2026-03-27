import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveGeneratedAnswerMock = vi.fn();

vi.mock("../../src/questions/strategies/generated.js", () => ({
  resolveGeneratedAnswer: resolveGeneratedAnswerMock,
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
  salaryExpectations: {
    usd: "50000-60000 USD yearly",
    eur: "3000-3500 EUR net monthly",
    try: "120000-140000 TRY net monthly",
  },
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
  });

  it("returns deterministic linkedin answers", async () => {
    const { resolveAnswer } = await import("../../src/answers/resolveAnswer.js");
    const result = await resolveAnswer({
      question: { label: "LinkedIn Profile", inputType: "text" },
      candidateProfile: profile,
    });

    expect(result.strategy).toBe("deterministic");
    expect(result.answer).toBe("https://linkedin.com/in/jane");
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

  it("routes disability questions to manual review when disclosure is manual", async () => {
    const { resolveAnswer } = await import("../../src/answers/resolveAnswer.js");
    const result = await resolveAnswer({
      question: {
        label: "Do you identify as disabled or require accommodations?",
        inputType: "radio",
      },
      candidateProfile: profile,
    });

    expect(result.strategy).toBe("needs-review");
    expect(result.confidenceLabel).toBe("manual_review");
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

  it("points back to candidate-profile.json when a required salary field is missing", async () => {
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

    expect(result.strategy).toBe("needs-review");
    expect(result.notes?.some((note) => note.includes("candidate-profile.json"))).toBe(true);
  });

  it("routes notice period questions to manual review", async () => {
    const { resolveAnswer } = await import("../../src/answers/resolveAnswer.js");
    const result = await resolveAnswer({
      question: {
        label: "When can you start? What is your notice period?",
        inputType: "text",
      },
      candidateProfile: profile,
    });

    expect(result.strategy).toBe("needs-review");
    expect(result.confidenceLabel).toBe("manual_review");
  });
});
