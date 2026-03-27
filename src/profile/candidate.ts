import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export const DEFAULT_CANDIDATE_PROFILE_PATH = path.resolve(
  process.cwd(),
  "candidate-profile.json",
);

const CandidateProfileSchema = z.object({
  yearsOfExperience: z.number().min(0),
  preferredRoles: z.array(z.string()).default([]),
  preferredTechStack: z.array(z.string()).default([]),
  aspirationalTechStack: z.array(z.string()).default([]),
  excludedRoles: z.array(z.string()).default([]),
  preferredLocations: z.array(z.string()).default([]),
  excludedLocations: z.array(z.string()).default([]),
  allowedHybridLocations: z.array(z.string()).default([]),
  remotePreference: z.enum(["remote", "hybrid", "onsite", "flexible"]),
  remoteOnly: z.boolean().default(false),
  visaRequirement: z.enum(["required", "not-required", "unknown"]),
  workAuthorizationStatus: z
    .enum(["authorized", "requires-sponsorship", "unknown"])
    .default("unknown"),
  languages: z.array(z.string()).default([]),
  experienceOverrides: z.record(z.string(), z.number().min(0)).default({}),
  salaryExpectations: z
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
    }),
  gpa: z.number().min(0).max(4).nullable().default(null),
  salaryExpectation: z.string().nullable().default(null),
  disability: z
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
    }),
});

export type CandidateProfile = z.infer<typeof CandidateProfileSchema>;

export const DEFAULT_CANDIDATE_PROFILE: CandidateProfile = {
  yearsOfExperience: 3,
  preferredRoles: [
    "Backend Engineer",
    "Software Engineer",
    "Full Stack Engineer",
  ],
  preferredTechStack: [
    "TypeScript",
    "Node.js",
    "React",
    "Next.js",
    "Prisma",
    "PostgreSQL",
  ],
  aspirationalTechStack: [
    "Python",
    "LLM APIs",
    "OpenAI",
    "Azure OpenAI",
    "AIOps",
    "n8n",
    "Airflow",
    "Prefect",
    "Docker",
    "CI/CD",
    "Linux",
  ],
  excludedRoles: ["Senior", "Lead", "Staff", "Principal"],
  preferredLocations: ["Remote", "Europe", "Turkey"],
  excludedLocations: ["Istanbul onsite"],
  allowedHybridLocations: ["Ankara", "Izmir", "İzmir", "Eskişehir", "Eskisehir", "Samsun"],
  remotePreference: "remote",
  remoteOnly: false,
  visaRequirement: "not-required",
  workAuthorizationStatus: "authorized",
  languages: ["English"],
  experienceOverrides: {},
  salaryExpectations: {
    usd: null,
    eur: null,
    try: null,
  },
  gpa: null,
  salaryExpectation: "Open to market-rate mid-level backend roles",
  disability: {
    hasVisualDisability: false,
    disabilityPercentage: null,
    requiresAccommodation: null,
    accommodationNotes: null,
    disclosurePreference: "manual-review",
  },
};

export async function loadCandidateProfile(
  profilePath = DEFAULT_CANDIDATE_PROFILE_PATH,
): Promise<CandidateProfile> {
  try {
    const content = await readFile(profilePath, "utf8");
    return CandidateProfileSchema.parse(JSON.parse(content));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return DEFAULT_CANDIDATE_PROFILE;
    }

    throw error;
  }
}
