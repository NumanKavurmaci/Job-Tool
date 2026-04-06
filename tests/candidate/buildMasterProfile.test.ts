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
      yearsOfExperience: 3,
      preferredRoles: ["Software Engineer"],
      preferredTechStack: ["TypeScript"],
      languages: ["English"],
      experienceOverrides: {
        linux: 0,
      },
      salaryExpectations: {
        usd: null,
        eur: "3000-3500 EUR net monthly",
        try: "120000-140000 TRY net monthly",
      },
      salaryExpectation: "Open to market-rate mid-level backend roles",
      gpa: 2.4,
      remotePreference: "remote",
      remoteOnly: true,
      demographics: {
        gender: "Male",
        pronouns: "he/him/his",
        ethnicity: "Turkish",
        race: "White",
        veteranStatus: "Not a veteran or martyr family member",
        sexualOrientation: "Prefer not to answer",
      },
      regionalAuthorization: {
        defaultRequiresSponsorship: true,
        turkeyRequiresSponsorship: false,
        europeRequiresSponsorship: true,
      },
      linkedinUrl: "https://www.linkedin.com/in/jane-manual",
      githubUrl: "https://github.com/jane-manual",
      portfolioUrl: "https://jane.dev",
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
      linkedinUrl: "https://www.linkedin.com/in/jane-resume",
      githubUrl: "https://github.com/jane-resume",
      portfolioUrl: "https://resume.dev",
      preferredRoles: ["Backend Engineer"],
      preferredTechStack: ["Node.js"],
      languages: ["German"],
      experienceOverrides: {},
      salaryExpectations: {
        usd: null,
        eur: null,
        try: null,
      },
      salaryExpectation: null,
      gpa: null,
      remotePreference: "hybrid",
      remoteOnly: false,
      demographics: {
        gender: null,
        pronouns: null,
        ethnicity: null,
        race: null,
        veteranStatus: null,
        sexualOrientation: null,
      },
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
      linkedinUrl: "https://www.linkedin.com/in/jane-manual",
      githubUrl: "https://github.com/jane-manual",
      portfolioUrl: "https://jane.dev",
      preferredRoles: ["Software Engineer", "Backend Engineer"],
      preferredTechStack: ["TypeScript", "Node.js"],
      languages: ["English", "German"],
      experienceOverrides: {
        linux: 0,
      },
      salaryExpectations: {
        usd: null,
        eur: "3000-3500 EUR net monthly",
        try: "120000-140000 TRY net monthly",
      },
      salaryExpectation: "Open to market-rate mid-level backend roles",
      gpa: 2.4,
      yearsOfExperienceTotal: 3,
      remotePreference: "remote",
      remoteOnly: true,
      regionalAuthorization: {
        defaultRequiresSponsorship: true,
        turkeyRequiresSponsorship: false,
        europeRequiresSponsorship: true,
      },
      demographics: {
        gender: "Male",
        pronouns: "he/him/his",
        ethnicity: "Turkish",
        race: "White",
        veteranStatus: "Not a veteran or martyr family member",
        sexualOrientation: "Prefer not to answer",
      },
      linkedinUrl: "https://www.linkedin.com/in/jane-manual",
      githubUrl: "https://github.com/jane-manual",
      portfolioUrl: "https://jane.dev",
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
      linkedinUrl: null,
      githubUrl: null,
      portfolioUrl: null,
      preferredRoles: [],
      preferredTechStack: [],
      languages: [],
      experienceOverrides: {},
      salaryExpectations: {
        usd: null,
        eur: null,
        try: null,
      },
      salaryExpectation: null,
      gpa: null,
      remotePreference: null,
      remoteOnly: false,
      demographics: {
        gender: null,
        pronouns: null,
        ethnicity: null,
        race: null,
        veteranStatus: null,
        sexualOrientation: null,
      },
      regionalAuthorization: {
        defaultRequiresSponsorship: null,
        turkeyRequiresSponsorship: null,
        europeRequiresSponsorship: null,
      },
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

  it("stores an absolute user resume path as a portable workspace-relative path in metadata", async () => {
    extractResumeTextMock.mockResolvedValue("resume text");
    parseResumeMock.mockResolvedValue({ fullName: "Jane Doe" });
    normalizeResumeMock.mockReturnValue({
      fullName: "Jane Doe",
      linkedinUrl: null,
      githubUrl: null,
      portfolioUrl: null,
      preferredRoles: [],
      preferredTechStack: [],
      languages: [],
      experienceOverrides: {},
      salaryExpectations: {
        usd: null,
        eur: null,
        try: null,
      },
      salaryExpectation: null,
      gpa: null,
      remotePreference: null,
      remoteOnly: false,
      demographics: {
        gender: null,
        pronouns: null,
        ethnicity: null,
        race: null,
        veteranStatus: null,
        sexualOrientation: null,
      },
      regionalAuthorization: {
        defaultRequiresSponsorship: null,
        turkeyRequiresSponsorship: null,
        europeRequiresSponsorship: null,
      },
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
      resumePath: `${process.cwd()}\\user\\resume.pdf`,
    });

    expect(normalizeResumeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: "Jane Doe",
      }),
      "resume text",
      expect.objectContaining({
        resumePath: expect.stringMatching(/^user[\\/]{1}resume\.pdf$/),
      }),
    );
  });
});
