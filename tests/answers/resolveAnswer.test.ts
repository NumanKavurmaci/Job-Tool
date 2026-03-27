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
  yearsOfExperienceTotal: 4,
  currentTitle: "Backend Engineer",
  preferredRoles: ["Backend Engineer"],
  preferredTechStack: ["TypeScript", "React", "Node.js"],
  skills: ["TypeScript", "React", "Node.js"],
  languages: ["English"],
  workAuthorization: "EU",
  requiresSponsorship: false,
  willingToRelocate: true,
  remotePreference: "remote",
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

  it("routes salary questions to manual review", async () => {
    const { resolveAnswer } = await import("../../src/answers/resolveAnswer.js");
    const result = await resolveAnswer({
      question: {
        label: "What is your salary expectation in EUR net after tax?",
        inputType: "text",
      },
      candidateProfile: profile,
    });

    expect(result.strategy).toBe("needs-review");
    expect(result.confidenceLabel).toBe("manual_review");
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
