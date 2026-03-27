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
        remoteOnly: true,
        visaRequirement: "not-required",
        workAuthorizationStatus: "authorized",
        languages: ["English"],
        experienceOverrides: {
          linux: 0,
        },
        salaryExpectations: {
          usd: "50000-60000 USD yearly",
          eur: "3000-3500 EUR net monthly",
          try: "120000-140000 TRY net monthly",
        },
        salaryExpectation: "100k+",
        disability: {
          hasVisualDisability: true,
          disabilityPercentage: 46,
          requiresAccommodation: null,
          accommodationNotes: null,
          disclosurePreference: "manual-review",
        },
      }),
      "utf8",
    );

    const profile = await loadCandidateProfile(profilePath);
    expect(profile.yearsOfExperience).toBe(5);
    expect(profile.preferredTechStack).toEqual(["TypeScript", "Node.js"]);
    expect(profile.remoteOnly).toBe(true);
    expect(profile.experienceOverrides.linux).toBe(0);
    expect(profile.salaryExpectations.eur).toContain("EUR");
    expect(profile.disability.hasVisualDisability).toBe(true);
  });

  it("accepts numeric salary expectations from JSON", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "job-tool-profile-"));
    const profilePath = path.join(tempDir, "candidate-profile.json");

    await writeFile(
      profilePath,
      JSON.stringify({
        yearsOfExperience: 5,
        preferredRoles: [],
        preferredTechStack: [],
        excludedRoles: [],
        preferredLocations: [],
        excludedLocations: [],
        remotePreference: "remote",
        remoteOnly: true,
        visaRequirement: "not-required",
        workAuthorizationStatus: "authorized",
        languages: ["English"],
        experienceOverrides: {},
        salaryExpectations: {
          usd: 2000,
          eur: 1800,
          try: 80000,
        },
      }),
      "utf8",
    );

    const profile = await loadCandidateProfile(profilePath);
    expect(profile.salaryExpectations.usd).toBe("2000");
    expect(profile.salaryExpectations.eur).toBe("1800");
    expect(profile.salaryExpectations.try).toBe("80000");
  });

  it("throws for invalid profile JSON", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "job-tool-profile-"));
    const profilePath = path.join(tempDir, "candidate-profile.json");

    await writeFile(profilePath, "{invalid json", "utf8");

    await expect(loadCandidateProfile(profilePath)).rejects.toThrow();
  });
});
