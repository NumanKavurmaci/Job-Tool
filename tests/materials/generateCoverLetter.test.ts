import { beforeEach, describe, expect, it, vi } from "vitest";

const completePromptMock = vi.fn();

vi.mock("../../src/llm/completePrompt.js", () => ({
  completePrompt: completePromptMock,
}));

const candidateProfile = {
  fullName: "Numan A.",
  email: "numan@example.com",
  phone: "+905555555555",
  location: "Istanbul",
  linkedinUrl: "https://linkedin.com/in/numan",
  githubUrl: "https://github.com/numan",
  portfolioUrl: null,
  summary: "Backend engineer focused on Node.js, TypeScript, and distributed systems.",
  yearsOfExperienceTotal: 5,
  currentTitle: "Backend Engineer",
  preferredRoles: ["Backend Engineer", "Full Stack Engineer"],
  preferredTechStack: ["Node.js", "TypeScript", "AWS"],
  skills: ["Node.js", "TypeScript", "AWS", "MongoDB"],
  languages: ["English", "Turkish"],
  workAuthorization: null,
  requiresSponsorship: null,
  willingToRelocate: true,
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
  experience: [
    {
      company: "Acme",
      title: "Senior Backend Engineer",
      summary: "Built APIs, improved platform reliability, and shipped cloud services.",
      technologies: ["Node.js", "TypeScript", "AWS"],
      startDate: null,
      endDate: null,
    },
  ],
  projects: [],
  resumeText: "resume text",
  sourceMetadata: {},
} as const;

describe("generateCoverLetter", () => {
  beforeEach(() => {
    vi.resetModules();
    completePromptMock.mockReset();
  });

  it("builds a cover letter from candidate and page context", async () => {
    completePromptMock.mockResolvedValue({
      text: "I am excited to contribute my backend experience to your product team.",
    });

    const { generateCoverLetter } = await import("../../src/materials/generateCoverLetter.js");
    const result = await generateCoverLetter({
      candidateProfile,
      targetJobContext: {
        title: "Backend Engineer",
        company: "Beta Limited",
        location: "Remote",
      },
      pageContextText: "We are looking for a backend engineer with Node.js, REST APIs, AWS, and MongoDB experience.",
      maxCharacters: 160,
    });

    expect(result.text).toContain("backend experience");
    expect(result.confidence).toBe(0.68);
    expect(result.notes?.[0]).toContain("visible external page context");
    expect(completePromptMock).toHaveBeenCalledOnce();
    expect(String(completePromptMock.mock.calls[0][0])).toContain("Beta Limited");
    expect(String(completePromptMock.mock.calls[0][0])).toContain("Node.js");
  });

  it("falls back to Unknown for missing candidate and page fields", async () => {
    completePromptMock.mockResolvedValue({
      text: "A concise cover letter",
    });

    const { generateCoverLetter } = await import("../../src/materials/generateCoverLetter.js");
    await generateCoverLetter({
      candidateProfile: {
        ...candidateProfile,
        fullName: null,
        currentTitle: null,
        location: null,
        summary: null,
        skills: [],
        preferredTechStack: [],
        experience: [],
      },
      targetJobContext: {
        title: null,
        company: null,
        location: null,
      },
      pageContextText: "   ",
    });

    const prompt = String(completePromptMock.mock.calls[0][0]);
    expect(prompt).toContain("Name: Unknown");
    expect(prompt).toContain("Current title: Unknown");
    expect(prompt).toContain("Skills: None listed");
    expect(prompt).toContain("Experience highlights:\n- None listed");
    expect(prompt).toContain("Visible page context:\nUnknown");
  });

  it("clips the generated text to the requested max length", async () => {
    completePromptMock.mockResolvedValue({
      text: "This generated cover letter is intentionally much longer than the allowed limit.",
    });

    const { generateCoverLetter } = await import("../../src/materials/generateCoverLetter.js");
    const result = await generateCoverLetter({
      candidateProfile,
      maxCharacters: 24,
    });

    expect(result.text).toHaveLength(24);
  });
});
