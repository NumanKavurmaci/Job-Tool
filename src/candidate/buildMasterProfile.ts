import path from "node:path";
import { normalizeLinkedinUrl } from "./linkedin.js";
import { loadCandidateProfile } from "../profile/candidate.js";
import { extractResumeText } from "./resume/extractResumeText.js";
import { normalizeResume } from "./resume/normalizeResume.js";
import { parseResume } from "./resume/parseResume.js";
import type { CandidateProfile } from "./types.js";

function unique(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(normalized);
    }
  }

  return result;
}

export async function buildMasterProfile(input: {
  resumePath: string;
  linkedinUrl?: string;
}): Promise<CandidateProfile> {
  const linkedinUrl = normalizeLinkedinUrl(input.linkedinUrl);
  const resumePathForMetadata = path.isAbsolute(input.resumePath)
    ? path.relative(process.cwd(), input.resumePath) || path.basename(input.resumePath)
    : input.resumePath;
  const manualProfile = await loadCandidateProfile();
  const resumeText = await extractResumeText(input.resumePath);
  const parsed = await parseResume(resumeText);
  const normalized = normalizeResume(parsed, resumeText, {
    resumePath: resumePathForMetadata,
    ...(linkedinUrl ? { linkedinUrl } : {}),
  });

  return {
    ...normalized,
    preferredRoles: unique([...manualProfile.preferredRoles, ...normalized.preferredRoles]),
    preferredTechStack: unique([
      ...manualProfile.preferredTechStack,
      ...normalized.preferredTechStack,
    ]),
    languages: unique([...manualProfile.languages, ...normalized.languages]),
    experienceOverrides: manualProfile.experienceOverrides,
    salaryExpectations: manualProfile.salaryExpectations,
    salaryExpectation: manualProfile.salaryExpectation,
    gpa: manualProfile.gpa,
    yearsOfExperienceTotal:
      normalized.yearsOfExperienceTotal ?? manualProfile.yearsOfExperience,
    remotePreference: manualProfile.remotePreference,
    remoteOnly: manualProfile.remoteOnly,
    disability: manualProfile.disability,
  };
}
