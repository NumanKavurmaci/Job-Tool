import { beforeEach, describe, expect, it, vi } from "vitest";

const extractResumeTextMock = vi.fn();
const parseResumeMock = vi.fn();
const normalizeResumeMock = vi.fn();
const loadCandidateProfileMock = vi.fn();

vi.mock("../../src/candidate/resume/extractResumeText.js", () => ({
  extractResumeText: extractResumeTextMock,
}));

vi.mock("../../src/candidate/resume/parseResume.js", () => ({
  parseResume: parseResumeMock,
}));

vi.mock("../../src/candidate/resume/normalizeResume.js", () => ({
  normalizeResume: normalizeResumeMock,
}));

vi.mock("../../src/profile/candidate.js", () => ({
  loadCandidateProfile: loadCandidateProfileMock,
}));

describe("buildMasterProfile", () => {
  beforeEach(() => {
    vi.resetModules();
    extractResumeTextMock.mockReset();
    parseResumeMock.mockReset();
    normalizeResumeMock.mockReset();
    loadCandidateProfileMock.mockReset();
    loadCandidateProfileMock.mockResolvedValue({
      preferredRoles: ["Software Engineer"],
      preferredTechStack: ["TypeScript"],
      languages: ["English"],
      salaryExpectations: {
        usd: null,
        eur: "3000-3500 EUR net monthly",
        try: "120000-140000 TRY net monthly",
      },
      gpa: 2.4,
      remotePreference: "remote",
      remoteOnly: true,
      disability: {
        hasVisualDisability: true,
        disabilityPercentage: 46,
        requiresAccommodation: null,
        accommodationNotes: null,
        disclosurePreference: "manual-review",
      },
    });
  });

  it("builds a profile from resume text and linkedin url", async () => {
    extractResumeTextMock.mockResolvedValue("resume text");
    parseResumeMock.mockResolvedValue({ fullName: "Jane Doe" });
    normalizeResumeMock.mockReturnValue({
      fullName: "Jane Doe",
      preferredRoles: ["Backend Engineer"],
      preferredTechStack: ["Node.js"],
      languages: ["German"],
      salaryExpectations: {
        usd: null,
        eur: null,
        try: null,
      },
      gpa: null,
      remotePreference: "hybrid",
      remoteOnly: false,
      disability: {
        hasVisualDisability: false,
        disabilityPercentage: null,
        requiresAccommodation: null,
        accommodationNotes: null,
        disclosurePreference: "manual-review",
      },
    });

    const { buildMasterProfile } = await import("../../src/candidate/buildMasterProfile.js");
    const result = await buildMasterProfile({
      resumePath: "./resume.txt",
      linkedinUrl: "https://www.linkedin.com/in/jane/?trk=public_profile",
    });

    expect(extractResumeTextMock).toHaveBeenCalledWith("./resume.txt");
    expect(parseResumeMock).toHaveBeenCalledWith("resume text");
    expect(normalizeResumeMock).toHaveBeenCalled();
    expect(result).toMatchObject({
      fullName: "Jane Doe",
      preferredRoles: ["Software Engineer", "Backend Engineer"],
      preferredTechStack: ["TypeScript", "Node.js"],
      languages: ["English", "German"],
      salaryExpectations: {
        usd: null,
        eur: "3000-3500 EUR net monthly",
        try: "120000-140000 TRY net monthly",
      },
      gpa: 2.4,
      remotePreference: "remote",
      remoteOnly: true,
      disability: {
        hasVisualDisability: true,
        disabilityPercentage: 46,
      },
    });
  });

  it("builds a profile without linkedin url", async () => {
    extractResumeTextMock.mockResolvedValue("resume text");
    parseResumeMock.mockResolvedValue({ fullName: "Jane Doe" });
    normalizeResumeMock.mockReturnValue({
      fullName: "Jane Doe",
      preferredRoles: [],
      preferredTechStack: [],
      languages: [],
      salaryExpectations: {
        usd: null,
        eur: null,
        try: null,
      },
      gpa: null,
      remotePreference: null,
      remoteOnly: false,
      disability: {
        hasVisualDisability: false,
        disabilityPercentage: null,
        requiresAccommodation: null,
        accommodationNotes: null,
        disclosurePreference: "manual-review",
      },
    });

    const { buildMasterProfile } = await import("../../src/candidate/buildMasterProfile.js");
    await buildMasterProfile({
      resumePath: "./resume.txt",
    });

    expect(normalizeResumeMock).toHaveBeenCalled();
  });
});
