import { beforeEach, describe, expect, it, vi } from "vitest";

const extractResumeTextMock = vi.fn();
const parseResumeMock = vi.fn();
const normalizeResumeMock = vi.fn();

vi.mock("../../src/candidate/resume/extractResumeText.js", () => ({
  extractResumeText: extractResumeTextMock,
}));

vi.mock("../../src/candidate/resume/parseResume.js", () => ({
  parseResume: parseResumeMock,
}));

vi.mock("../../src/candidate/resume/normalizeResume.js", () => ({
  normalizeResume: normalizeResumeMock,
}));

describe("buildMasterProfile", () => {
  beforeEach(() => {
    vi.resetModules();
    extractResumeTextMock.mockReset();
    parseResumeMock.mockReset();
    normalizeResumeMock.mockReset();
  });

  it("builds a profile from resume text and linkedin url", async () => {
    extractResumeTextMock.mockResolvedValue("resume text");
    parseResumeMock.mockResolvedValue({ fullName: "Jane Doe" });
    normalizeResumeMock.mockReturnValue({ fullName: "Jane Doe" });

    const { buildMasterProfile } = await import("../../src/candidate/buildMasterProfile.js");
    const result = await buildMasterProfile({
      resumePath: "./resume.txt",
      linkedinUrl: "https://www.linkedin.com/in/jane/?trk=public_profile",
    });

    expect(extractResumeTextMock).toHaveBeenCalledWith("./resume.txt");
    expect(parseResumeMock).toHaveBeenCalledWith("resume text");
    expect(normalizeResumeMock).toHaveBeenCalled();
    expect(result).toEqual({ fullName: "Jane Doe" });
  });

  it("builds a profile without linkedin url", async () => {
    extractResumeTextMock.mockResolvedValue("resume text");
    parseResumeMock.mockResolvedValue({ fullName: "Jane Doe" });
    normalizeResumeMock.mockReturnValue({ fullName: "Jane Doe" });

    const { buildMasterProfile } = await import("../../src/candidate/buildMasterProfile.js");
    await buildMasterProfile({
      resumePath: "./resume.txt",
    });

    expect(normalizeResumeMock).toHaveBeenCalled();
  });
});
