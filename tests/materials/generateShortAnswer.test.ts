import { beforeEach, describe, expect, it, vi } from "vitest";

const completePromptMock = vi.fn();

vi.mock("../../src/llm/completePrompt.js", () => ({
  completePrompt: completePromptMock,
}));

describe("generateShortAnswer", () => {
  beforeEach(() => {
    vi.resetModules();
    completePromptMock.mockReset();
  });

  it("generates a bounded short answer", async () => {
    completePromptMock.mockResolvedValue({
      text: "I am interested because the role matches my TypeScript and backend experience.",
    });

    const { generateShortAnswer } = await import("../../src/materials/generateShortAnswer.js");
    const result = await generateShortAnswer({
      question: "Why are you interested in this role?",
      candidateProfile: {
        fullName: "Jane Doe",
        email: null,
        phone: null,
        location: null,
        linkedinUrl: null,
        githubUrl: null,
        portfolioUrl: null,
        summary: "Backend engineer",
        yearsOfExperienceTotal: 4,
        currentTitle: "Backend Engineer",
        preferredRoles: ["Backend Engineer"],
        preferredTechStack: ["TypeScript"],
        skills: ["TypeScript"],
        languages: ["English"],
        workAuthorization: null,
        requiresSponsorship: null,
        willingToRelocate: null,
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
        experience: [],
        projects: [],
        resumeText: "resume text",
        sourceMetadata: {},
      },
      maxCharacters: 80,
    });

    expect(result.text.length).toBeLessThanOrEqual(80);
    expect(result.notes?.[0]).toContain("Review");
  });

  it("includes target job context when provided", async () => {
    completePromptMock.mockResolvedValue({
      text: "I am interested because the role matches my backend experience at scale.",
    });

    const { generateShortAnswer } = await import("../../src/materials/generateShortAnswer.js");
    const result = await generateShortAnswer({
      question: "Why are you interested in this role?",
      candidateProfile: {
        fullName: "Jane Doe",
        email: null,
        phone: null,
        location: null,
        linkedinUrl: null,
        githubUrl: null,
        portfolioUrl: null,
        summary: "Backend engineer",
        yearsOfExperienceTotal: 4,
        currentTitle: "Backend Engineer",
        preferredRoles: ["Backend Engineer"],
        preferredTechStack: ["TypeScript"],
        skills: ["TypeScript"],
        languages: ["English"],
        workAuthorization: null,
        requiresSponsorship: null,
        willingToRelocate: null,
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
        experience: [],
        projects: [],
        resumeText: "resume text",
        sourceMetadata: {},
      },
      targetJobContext: {
        title: "Senior Backend Engineer",
        company: "Acme",
        location: "Remote",
      },
      maxCharacters: 120,
    });

    expect(result.text).toContain("backend");
    expect(completePromptMock).toHaveBeenCalled();
  });
});
