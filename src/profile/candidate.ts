import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const CandidateProfileSchema = z.object({
  yearsOfExperience: z.number().min(0),
  preferredRoles: z.array(z.string()).default([]),
  preferredTechStack: z.array(z.string()).default([]),
  excludedRoles: z.array(z.string()).default([]),
  preferredLocations: z.array(z.string()).default([]),
  excludedLocations: z.array(z.string()).default([]),
  remotePreference: z.enum(["remote", "hybrid", "onsite", "flexible"]),
  visaRequirement: z.enum(["required", "not-required", "unknown"]),
  workAuthorizationStatus: z
    .enum(["authorized", "requires-sponsorship", "unknown"])
    .default("unknown"),
  languages: z.array(z.string()).default([]),
  salaryExpectation: z.string().nullable().default(null),
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
  excludedRoles: ["Senior", "Lead", "Staff", "Principal"],
  preferredLocations: ["Remote", "Europe", "Turkey"],
  excludedLocations: ["Istanbul onsite"],
  remotePreference: "remote",
  visaRequirement: "not-required",
  workAuthorizationStatus: "authorized",
  languages: ["English"],
  salaryExpectation: "Open to market-rate mid-level backend roles",
};

export async function loadCandidateProfile(
  profilePath = path.resolve(process.cwd(), "candidate-profile.json"),
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
