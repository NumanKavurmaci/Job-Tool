import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CANDIDATE_PROFILE,
  loadCandidateProfile,
} from "../../src/profile/candidate.js";

describe("candidate profile loader", () => {
  it("returns the default profile when the file is missing", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "job-tool-profile-"));
    const profile = await loadCandidateProfile(path.join(tempDir, "missing.json"));

    expect(profile).toEqual(DEFAULT_CANDIDATE_PROFILE);
  });

  it("loads a profile from JSON", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "job-tool-profile-"));
    const profilePath = path.join(tempDir, "candidate-profile.json");

    await writeFile(
      profilePath,
      JSON.stringify({
        yearsOfExperience: 5,
        preferredRoles: ["Backend Engineer"],
        preferredTechStack: ["TypeScript", "Node.js"],
        excludedRoles: ["Staff"],
        preferredLocations: ["Remote"],
        excludedLocations: ["Istanbul onsite"],
        remotePreference: "remote",
        visaRequirement: "not-required",
        workAuthorizationStatus: "authorized",
        languages: ["English"],
        salaryExpectation: "100k+",
      }),
      "utf8",
    );

    const profile = await loadCandidateProfile(profilePath);
    expect(profile.yearsOfExperience).toBe(5);
    expect(profile.preferredTechStack).toEqual(["TypeScript", "Node.js"]);
  });

  it("throws for invalid profile JSON", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "job-tool-profile-"));
    const profilePath = path.join(tempDir, "candidate-profile.json");

    await writeFile(profilePath, "{invalid json", "utf8");

    await expect(loadCandidateProfile(profilePath)).rejects.toThrow();
  });
});
