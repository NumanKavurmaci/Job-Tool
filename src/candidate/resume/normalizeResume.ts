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

function compactWhitespace(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized ? normalized : null;
}

function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\s+/g, "").trim();
  return normalized ? normalized : null;
}

function extractEmailFromResumeText(resumeText: string): string | null {
  const match = resumeText.match(/[A-Z0-9._%+-]+(?:\s+)?@[A-Z0-9.-]+\.(?:\s+)?[A-Z]{2,}/i);
  return match ? normalizeEmail(match[0]) : null;
}

function extractLinkedinUrlFromResumeText(resumeText: string): string | null {
  const normalizedText = resumeText.replace(/\s+/g, "");
  const match = normalizedText.match(
    /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9\-_%\u00C0-\u024F]+/i,
  );
  if (!match) {
    return null;
  }

  const url = match[0].replace(/^www\./i, "https://www.");
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function extractPhoneFromResumeText(resumeText: string): string | null {
  const match = resumeText.match(/(?:\+\d[\d\s().-]{8,}\d)/);
  return match ? compactWhitespace(match[0]) : null;
}

export function normalizeResume(
  parsed: ParsedResume,
  resumeText: string,
  sourceMetadata: CandidateProfile["sourceMetadata"],
): CandidateProfile {
  const email = normalizeEmail(parsed.email) ?? extractEmailFromResumeText(resumeText);
  const phone = compactWhitespace(parsed.phone) ?? extractPhoneFromResumeText(resumeText);
  const linkedinUrl =
    compactWhitespace(sourceMetadata.linkedinUrl)
    ?? extractLinkedinUrlFromResumeText(resumeText);

  return {
    fullName: parsed.fullName,
    email,
    phone,
    location: compactWhitespace(parsed.location),
    linkedinUrl,
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
