import { beforeEach, describe, expect, it, vi } from "vitest";

const buildMasterProfileMock = vi.fn();

vi.mock("../../src/candidate/buildMasterProfile.js", () => ({
  buildMasterProfile: buildMasterProfileMock,
}));

describe("loadCandidateMasterProfile", () => {
  beforeEach(() => {
    vi.resetModules();
    buildMasterProfileMock.mockReset();
  });

  it("delegates to buildMasterProfile", async () => {
    buildMasterProfileMock.mockResolvedValue({ fullName: "Jane Doe" });
    const { loadCandidateMasterProfile } = await import(
      "../../src/candidate/loadCandidateProfile.js"
    );

    const result = await loadCandidateMasterProfile({
      resumePath: "./resume.txt",
      linkedinUrl: "https://linkedin.com/in/jane",
    });

    expect(buildMasterProfileMock).toHaveBeenCalledWith({
      resumePath: "./resume.txt",
      linkedinUrl: "https://linkedin.com/in/jane",
    });
    expect(result).toEqual({ fullName: "Jane Doe" });
  });
});
