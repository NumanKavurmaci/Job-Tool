import type { CandidateProfile, ParsedResume } from "../types.js";

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

export function normalizeResume(
  parsed: ParsedResume,
  resumeText: string,
  sourceMetadata: CandidateProfile["sourceMetadata"],
): CandidateProfile {
  return {
    fullName: parsed.fullName,
    email: parsed.email,
    phone: parsed.phone,
    location: parsed.location,
    linkedinUrl: sourceMetadata.linkedinUrl ?? null,
    githubUrl: parsed.githubUrl,
    portfolioUrl: parsed.portfolioUrl,
    summary: parsed.summary,
    gpa: null,
    yearsOfExperienceTotal: parsed.yearsOfExperienceTotal,
    currentTitle: parsed.currentTitle,
    preferredRoles: unique([
      parsed.currentTitle,
      ...parsed.experience.map((item) => item.title),
    ]),
    preferredTechStack: unique([
      ...parsed.skills,
      ...parsed.experience.flatMap((item) => item.technologies),
      ...parsed.projects.flatMap((item) => item.technologies),
    ]),
    skills: unique(parsed.skills),
    languages: unique(parsed.languages),
    experienceOverrides: {},
    salaryExpectations: {
      usd: null,
      eur: null,
      try: null,
    },
    salaryExpectation: null,
    workAuthorization: parsed.workAuthorization,
    requiresSponsorship: parsed.requiresSponsorship,
    willingToRelocate: parsed.willingToRelocate,
    remotePreference: parsed.remotePreference,
    remoteOnly: false,
    disability: {
      hasVisualDisability: false,
      disabilityPercentage: null,
      requiresAccommodation: null,
      accommodationNotes: null,
      disclosurePreference: "manual-review",
    },
    education: parsed.education,
    experience: parsed.experience,
    projects: parsed.projects,
    resumeText,
    sourceMetadata,
  };
}
