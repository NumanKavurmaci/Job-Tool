import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export const DEFAULT_CANDIDATE_PROFILE_PATH = path.resolve(
  process.cwd(),
  "user",
  "profile.json",
);
export const DEFAULT_CANDIDATE_PROFILE_EXAMPLE_PATH = path.resolve(
  process.cwd(),
  "user",
  "profile.example.json",
);

const DisabilitySchema = z
  .object({
    hasVisualDisability: z.boolean().default(false),
    disabilityPercentage: z.number().min(0).max(100).nullable().default(null),
    requiresAccommodation: z.boolean().nullable().default(null),
    accommodationNotes: z.string().nullable().default(null),
    disclosurePreference: z
      .enum(["manual-review", "disclose", "prefer-not-to-say"])
      .default("manual-review"),
  })
  .default({
    hasVisualDisability: false,
    disabilityPercentage: null,
    requiresAccommodation: null,
    accommodationNotes: null,
    disclosurePreference: "manual-review",
  });

const DemographicsSchema = z
  .object({
    gender: z.string().nullable().default(null),
    pronouns: z.string().nullable().default(null),
    ethnicity: z.string().nullable().default(null),
    race: z.string().nullable().default(null),
    veteranStatus: z.string().nullable().default(null),
    sexualOrientation: z.string().nullable().default(null),
  })
  .default({
    gender: null,
    pronouns: null,
    ethnicity: null,
    race: null,
    veteranStatus: null,
    sexualOrientation: null,
  });

const SalaryExpectationsSchema = z
  .object({
    usd: z
      .union([z.string(), z.number(), z.null()])
      .transform((value) => (value == null ? null : String(value)))
      .default(null),
    eur: z
      .union([z.string(), z.number(), z.null()])
      .transform((value) => (value == null ? null : String(value)))
      .default(null),
    try: z
      .union([z.string(), z.number(), z.null()])
      .transform((value) => (value == null ? null : String(value)))
      .default(null),
  })
  .default({
    usd: null,
    eur: null,
    try: null,
  });

const CandidateProfileFileSchema = z.object({
  experience: z
    .object({
      years: z.number().min(0).default(0),
      overrides: z.record(z.string(), z.number().min(0)).default({}),
    })
    .default({
      years: 0,
      overrides: {},
    }),
  targeting: z
    .object({
      preferredRoles: z.array(z.string()).default([]),
      preferredTechStack: z.array(z.string()).default([]),
      aspirationalTechStack: z.array(z.string()).default([]),
      preferredRoleOverlapSignals: z.array(z.string()).default([]),
      excludedRoles: z.array(z.string()).default([]),
      disallowedRoleKeywords: z.array(z.string()).default([]),
    })
    .default({
      preferredRoles: [],
      preferredTechStack: [],
      aspirationalTechStack: [],
      preferredRoleOverlapSignals: [],
      excludedRoles: [],
      disallowedRoleKeywords: [],
    }),
  locations: z
    .object({
      preferred: z.array(z.string()).default([]),
      excluded: z.array(z.string()).default([]),
      allowedHybrid: z.array(z.string()).default([]),
      workplacePolicyBypass: z.array(z.string()).default([]),
      remotePreference: z
        .enum(["remote", "hybrid", "onsite", "flexible"])
        .default("flexible"),
      remoteOnly: z.boolean().default(false),
    })
    .default({
      preferred: [],
      excluded: [],
      allowedHybrid: [],
      workplacePolicyBypass: [],
      remotePreference: "flexible",
      remoteOnly: false,
    }),
  authorization: z
    .object({
      visaRequirement: z
        .enum(["required", "not-required", "unknown"])
        .default("unknown"),
      workAuthorizationStatus: z
        .enum(["authorized", "requires-sponsorship", "unknown"])
        .default("unknown"),
      regional: z
        .object({
          defaultRequiresSponsorship: z.boolean().nullable().default(null),
          turkeyRequiresSponsorship: z.boolean().nullable().default(null),
          europeRequiresSponsorship: z.boolean().nullable().default(null),
        })
        .default({
          defaultRequiresSponsorship: null,
          turkeyRequiresSponsorship: null,
          europeRequiresSponsorship: null,
        }),
    })
    .default({
      visaRequirement: "unknown",
      workAuthorizationStatus: "unknown",
      regional: {
        defaultRequiresSponsorship: null,
        turkeyRequiresSponsorship: null,
        europeRequiresSponsorship: null,
      },
    }),
  personal: z
    .object({
      languages: z.array(z.string()).default([]),
      gpa: z.number().min(0).max(4).nullable().default(null),
      demographics: DemographicsSchema,
      disability: DisabilitySchema,
    })
    .default({
      languages: [],
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
    }),
  identity: z
    .object({
      linkedinUrl: z.string().url().nullable().default(null),
      githubUrl: z.string().url().nullable().default(null),
      portfolioUrl: z.string().url().nullable().default(null),
    })
    .default({
      linkedinUrl: null,
      githubUrl: null,
      portfolioUrl: null,
    }),
  compensation: z
    .object({
      expectations: SalaryExpectationsSchema,
      summary: z.string().nullable().default(null),
    })
    .default({
      expectations: {
        usd: null,
        eur: null,
        try: null,
      },
      summary: null,
    }),
});

type CandidateProfileFile = z.infer<typeof CandidateProfileFileSchema>;

export type CandidateProfile = {
  yearsOfExperience: number;
  preferredRoles: string[];
  preferredTechStack: string[];
  aspirationalTechStack: string[];
  preferredRoleOverlapSignals: string[];
  disallowedRoleKeywords: string[];
  excludedRoles: string[];
  preferredLocations: string[];
  excludedLocations: string[];
  allowedHybridLocations: string[];
  workplacePolicyBypassLocations?: string[];
  remotePreference: "remote" | "hybrid" | "onsite" | "flexible";
  remoteOnly: boolean;
  visaRequirement: "required" | "not-required" | "unknown";
  workAuthorizationStatus: "authorized" | "requires-sponsorship" | "unknown";
  regionalAuthorization: {
    defaultRequiresSponsorship: boolean | null;
    turkeyRequiresSponsorship: boolean | null;
    europeRequiresSponsorship: boolean | null;
  };
  linkedinUrl: string | null;
  githubUrl: string | null;
  portfolioUrl: string | null;
  languages: string[];
  experienceOverrides: Record<string, number>;
  salaryExpectations: {
    usd: string | null;
    eur: string | null;
    try: string | null;
  };
  gpa: number | null;
  salaryExpectation: string | null;
  demographics: z.infer<typeof DemographicsSchema>;
  disability: z.infer<typeof DisabilitySchema>;
};

function toRuntimeProfile(file: CandidateProfileFile): CandidateProfile {
  return {
    yearsOfExperience: file.experience.years,
    preferredRoles: file.targeting.preferredRoles,
    preferredTechStack: file.targeting.preferredTechStack,
    aspirationalTechStack: file.targeting.aspirationalTechStack,
    preferredRoleOverlapSignals: file.targeting.preferredRoleOverlapSignals,
    disallowedRoleKeywords: file.targeting.disallowedRoleKeywords,
    excludedRoles: file.targeting.excludedRoles,
    preferredLocations: file.locations.preferred,
    excludedLocations: file.locations.excluded,
    allowedHybridLocations: file.locations.allowedHybrid,
    workplacePolicyBypassLocations: file.locations.workplacePolicyBypass,
    remotePreference: file.locations.remotePreference,
    remoteOnly: file.locations.remoteOnly,
    visaRequirement: file.authorization.visaRequirement,
    workAuthorizationStatus: file.authorization.workAuthorizationStatus,
    regionalAuthorization: file.authorization.regional,
    linkedinUrl: file.identity.linkedinUrl,
    githubUrl: file.identity.githubUrl,
    portfolioUrl: file.identity.portfolioUrl,
    languages: file.personal.languages,
    experienceOverrides: file.experience.overrides,
    salaryExpectations: file.compensation.expectations,
    gpa: file.personal.gpa,
    salaryExpectation: file.compensation.summary,
    demographics: file.personal.demographics,
    disability: file.personal.disability,
  };
}

export const DEFAULT_CANDIDATE_PROFILE: CandidateProfile = toRuntimeProfile(
  CandidateProfileFileSchema.parse({}),
);

export async function loadCandidateProfile(
  profilePath = DEFAULT_CANDIDATE_PROFILE_PATH,
): Promise<CandidateProfile> {
  try {
    const content = await readFile(profilePath, "utf8");
    const parsed = CandidateProfileFileSchema.parse(JSON.parse(content));
    return toRuntimeProfile(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      try {
        const exampleContent = await readFile(
          DEFAULT_CANDIDATE_PROFILE_EXAMPLE_PATH,
          "utf8",
        );
        const parsedExample = CandidateProfileFileSchema.parse(
          JSON.parse(exampleContent),
        );
        return toRuntimeProfile(parsedExample);
      } catch (exampleError) {
        if ((exampleError as NodeJS.ErrnoException).code === "ENOENT") {
          return DEFAULT_CANDIDATE_PROFILE;
        }

        throw exampleError;
      }
    }

    throw error;
  }
}
