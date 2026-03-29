import { beforeEach, describe, expect, it, vi } from "vitest";

const generateShortAnswerMock = vi.fn();
const generateCoverLetterMock = vi.fn();

vi.mock("../../src/materials/generateShortAnswer.js", () => ({
  generateShortAnswer: generateShortAnswerMock,
}));

vi.mock("../../src/materials/generateCoverLetter.js", () => ({
  generateCoverLetter: generateCoverLetterMock,
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
  gpa: null,
  yearsOfExperienceTotal: 4,
  currentTitle: "Backend Engineer",
  preferredRoles: ["Backend Engineer"],
  preferredTechStack: ["TypeScript", "Node.js"],
  skills: ["TypeScript", "Node.js"],
  languages: ["English"],
  salaryExpectations: { usd: null, eur: null, try: null },
  salaryExpectation: null,
  experienceOverrides: {},
  workAuthorization: "authorized",
  requiresSponsorship: false,
  willingToRelocate: false,
  remotePreference: "remote",
  remoteOnly: true,
  disability: {
    hasVisualDisability: false,
    disabilityPercentage: null,
    requiresAccommodation: null,
    accommodationNotes: null,
    disclosurePreference: "manual-review",
  },
  education: [],
  experience: [],
  projects: [],
  resumeText: "resume",
  sourceMetadata: {
    resumePath: "./user/resume.pdf",
  },
} as const;

describe("resolveGeneratedAnswer", () => {
  beforeEach(() => {
    vi.resetModules();
    generateShortAnswerMock.mockReset();
    generateCoverLetterMock.mockReset();
  });

  it("uses the cover letter generator for cover letter questions with page context", async () => {
    generateCoverLetterMock.mockResolvedValue({
      text: "I am excited to apply for this backend role.",
      confidence: 0.68,
      notes: ["Generated from visible page context."],
    });

    const { resolveGeneratedAnswer } = await import("../../src/questions/strategies/generated.js");
    const result = await resolveGeneratedAnswer(
      {
        type: "cover_letter",
        normalizedText: "cover letter",
        confidence: 0.98,
      },
      profile,
      {
        title: "Backend Engineer",
        company: "Beta Limited",
        location: "Remote",
      },
      {
        title: "Backend Engineer Job application",
        sourceUrl: "https://tally.so/r/31yWVM",
        text: "Required tech stack: Node.js, TypeScript, RESTful API, AWS, MongoDB.",
      },
    );

    expect(generateCoverLetterMock).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateProfile: profile,
        targetJobContext: {
          title: "Backend Engineer",
          company: "Beta Limited",
          location: "Remote",
        },
        pageContextText: expect.stringContaining("Required tech stack: Node.js"),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        questionType: "cover_letter",
        strategy: "generated",
        answer: "I am excited to apply for this backend role.",
      }),
    );
    expect(generateShortAnswerMock).not.toHaveBeenCalled();
  });
});
