import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CANDIDATE_PROFILE,
  loadCandidateProfile,
} from "../../src/profile/candidate.js";

describe("candidate profile loader", () => {
  it("falls back to the tracked example profile when the local user profile is missing", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "job-tool-profile-"));
    const profile = await loadCandidateProfile(path.join(tempDir, "missing.json"));

    expect(profile.preferredRoles).toContain("Software Engineer");
    expect(profile.preferredTechStack).toContain("TypeScript");
    expect(profile.remotePreference).toBe("remote");
  });

  it("keeps an internal generic default profile for last-resort fallback", async () => {
    expect(DEFAULT_CANDIDATE_PROFILE).toEqual({
      yearsOfExperience: 0,
      preferredRoles: [],
      preferredTechStack: [],
      aspirationalTechStack: [],
      preferredRoleOverlapSignals: [],
      disallowedRoleKeywords: [],
      excludedRoles: [],
      preferredLocations: [],
      excludedLocations: [],
      allowedHybridLocations: [],
      remotePreference: "flexible",
      remoteOnly: false,
      visaRequirement: "unknown",
      workAuthorizationStatus: "unknown",
      languages: [],
      experienceOverrides: {},
      salaryExpectations: {
        usd: null,
        eur: null,
        try: null,
      },
      gpa: null,
      salaryExpectation: null,
      disability: {
        hasVisualDisability: false,
        disabilityPercentage: null,
        requiresAccommodation: null,
        accommodationNotes: null,
        disclosurePreference: "manual-review",
      },
    });
  });

  it("loads a nested profile from JSON", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "job-tool-profile-"));
    const profilePath = path.join(tempDir, "profile.json");

    await writeFile(
      profilePath,
      JSON.stringify({
        experience: {
          years: 5,
          overrides: {
            linux: 0,
          },
        },
        targeting: {
          preferredRoles: ["Backend Engineer"],
          preferredTechStack: ["TypeScript", "Node.js"],
          aspirationalTechStack: ["Python", "LLM APIs", "AIOps"],
          preferredRoleOverlapSignals: ["frontend", "full stack"],
          excludedRoles: ["Staff"],
          disallowedRoleKeywords: ["ios"],
        },
        locations: {
          preferred: ["Remote"],
          excluded: ["Istanbul onsite"],
          allowedHybrid: ["Ankara", "Izmir"],
          remotePreference: "remote",
          remoteOnly: true,
        },
        authorization: {
          visaRequirement: "not-required",
          workAuthorizationStatus: "authorized",
        },
        personal: {
          languages: ["English"],
          gpa: 2.4,
          disability: {
            hasVisualDisability: true,
            disabilityPercentage: 46,
            requiresAccommodation: null,
            accommodationNotes: null,
            disclosurePreference: "manual-review",
          },
        },
        compensation: {
          expectations: {
            usd: "50000-60000 USD yearly",
            eur: "3000-3500 EUR net monthly",
            try: "120000-140000 TRY net monthly",
          },
          summary: "100k+",
        },
      }),
      "utf8",
    );

    const profile = await loadCandidateProfile(profilePath);
    expect(profile.yearsOfExperience).toBe(5);
    expect(profile.preferredTechStack).toEqual(["TypeScript", "Node.js"]);
    expect(profile.aspirationalTechStack).toEqual(["Python", "LLM APIs", "AIOps"]);
    expect(profile.preferredRoleOverlapSignals).toEqual(["frontend", "full stack"]);
    expect(profile.disallowedRoleKeywords).toEqual(["ios"]);
    expect(profile.remoteOnly).toBe(true);
    expect(profile.allowedHybridLocations).toEqual(["Ankara", "Izmir"]);
    expect(profile.experienceOverrides.linux).toBe(0);
    expect(profile.salaryExpectations.eur).toContain("EUR");
    expect(profile.salaryExpectation).toBe("100k+");
    expect(profile.disability.hasVisualDisability).toBe(true);
  });

  it("accepts numeric salary expectations from nested JSON", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "job-tool-profile-"));
    const profilePath = path.join(tempDir, "profile.json");

    await writeFile(
      profilePath,
      JSON.stringify({
        experience: { years: 5, overrides: {} },
        targeting: {
          preferredRoles: [],
          preferredTechStack: [],
          aspirationalTechStack: [],
          preferredRoleOverlapSignals: [],
          excludedRoles: [],
          disallowedRoleKeywords: [],
        },
        locations: {
          preferred: [],
          excluded: [],
          allowedHybrid: [],
          remotePreference: "remote",
          remoteOnly: true,
        },
        authorization: {
          visaRequirement: "not-required",
          workAuthorizationStatus: "authorized",
        },
        personal: {
          languages: ["English"],
          gpa: null,
          disability: {
            hasVisualDisability: false,
            disabilityPercentage: null,
            requiresAccommodation: null,
            accommodationNotes: null,
            disclosurePreference: "manual-review",
          },
        },
        compensation: {
          expectations: {
            usd: 2000,
            eur: 1800,
            try: 80000,
          },
          summary: null,
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
    const profilePath = path.join(tempDir, "profile.json");

    await writeFile(profilePath, "{invalid json", "utf8");

    await expect(loadCandidateProfile(profilePath)).rejects.toThrow();
  });
});
