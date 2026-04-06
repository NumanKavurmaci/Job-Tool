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
      workplacePolicyBypassLocations: [],
      remotePreference: "flexible",
      remoteOnly: false,
      visaRequirement: "unknown",
      workAuthorizationStatus: "unknown",
      regionalAuthorization: {
        defaultRequiresSponsorship: null,
        turkeyRequiresSponsorship: null,
        europeRequiresSponsorship: null,
      },
      linkedinUrl: null,
      githubUrl: null,
      portfolioUrl: null,
      languages: [],
      experienceOverrides: {},
      salaryExpectations: {
        usd: null,
        eur: null,
        try: null,
      },
      gpa: null,
      salaryExpectation: null,
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
          workplacePolicyBypass: ["Europe"],
          allowedHybrid: ["Ankara", "Izmir"],
          remotePreference: "remote",
          remoteOnly: true,
        },
        authorization: {
          visaRequirement: "not-required",
          workAuthorizationStatus: "authorized",
          regional: {
            defaultRequiresSponsorship: true,
            turkeyRequiresSponsorship: false,
            europeRequiresSponsorship: true,
          },
        },
        personal: {
          languages: ["English"],
          gpa: 2.4,
          demographics: {
            gender: "Male",
            pronouns: "he/him/his",
            ethnicity: "Turkish",
            race: "White",
            veteranStatus: "Not a veteran",
            sexualOrientation: "Prefer not to answer",
          },
          disability: {
            hasVisualDisability: true,
            disabilityPercentage: 46,
            requiresAccommodation: null,
            accommodationNotes: null,
            disclosurePreference: "manual-review",
          },
        },
        identity: {
          linkedinUrl: "https://www.linkedin.com/in/jane-doe",
          githubUrl: "https://github.com/jane-doe",
          portfolioUrl: "https://jane.dev",
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
    expect(profile.regionalAuthorization).toEqual({
      defaultRequiresSponsorship: true,
      turkeyRequiresSponsorship: false,
      europeRequiresSponsorship: true,
    });
    expect(profile.linkedinUrl).toBe("https://www.linkedin.com/in/jane-doe");
    expect(profile.githubUrl).toBe("https://github.com/jane-doe");
    expect(profile.portfolioUrl).toBe("https://jane.dev");
    expect(profile.allowedHybridLocations).toEqual(["Ankara", "Izmir"]);
    expect(profile.workplacePolicyBypassLocations).toEqual(["Europe"]);
    expect(profile.experienceOverrides.linux).toBe(0);
    expect(profile.salaryExpectations.eur).toContain("EUR");
    expect(profile.salaryExpectation).toBe("100k+");
    expect(profile.demographics.gender).toBe("Male");
    expect(profile.demographics.pronouns).toBe("he/him/his");
    expect(profile.demographics.ethnicity).toBe("Turkish");
    expect(profile.demographics.sexualOrientation).toBe("Prefer not to answer");
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
          workplacePolicyBypass: [],
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
