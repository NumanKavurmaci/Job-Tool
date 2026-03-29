import type { NormalizedJob } from "../domain/job.js";
import type { CandidateProfile } from "../profile/candidate.js";

export type PolicyResult = {
  allowed: boolean;
  reasons: string[];
};

function includesAny(haystack: string, needles: string[]): string | null {
  const lowerHaystack = haystack.toLowerCase();

  for (const needle of needles) {
    if (lowerHaystack.includes(needle.toLowerCase())) {
      return needle;
    }
  }

  return null;
}

function includesAllowedHybridLocation(
  location: string | null,
  allowedHybridLocations: string[],
): string | null {
  const normalizedLocation = (location ?? "").toLowerCase();

  for (const allowedLocation of allowedHybridLocations) {
    if (normalizedLocation.includes(allowedLocation.toLowerCase())) {
      return allowedLocation;
    }
  }

  return null;
}

function includesRoleKeyword(haystack: string, keywords: string[]): string | null {
  const normalizedHaystack = haystack.toLowerCase();

  for (const keyword of keywords) {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) {
      continue;
    }

    const pattern = new RegExp(`\\b${normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (pattern.test(normalizedHaystack)) {
      return keyword;
    }
  }

  return null;
}

function hasPreferredStackOverlap(job: NormalizedJob, profile: CandidateProfile): boolean {
  const haystack = [
    job.title,
    ...job.technologies,
    ...job.mustHaveSkills,
    ...job.niceToHaveSkills,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!haystack) {
    return false;
  }

  const preferredSignals = [
    ...profile.preferredTechStack,
    ...profile.aspirationalTechStack,
    ...profile.preferredRoleOverlapSignals,
  ];

  return preferredSignals.some((signal) => haystack.includes(signal.toLowerCase()));
}

function isPureJavaRole(job: NormalizedJob, profile: CandidateProfile): boolean {
  const title = (job.title ?? "").toLowerCase();
  if (!title) {
    return false;
  }

  const isJavaRole =
    /\bjava\b/.test(title) &&
    /\b(developer|engineer|software engineer|software developer|backend engineer|backend developer)\b/.test(
      title,
    );

  if (!isJavaRole) {
    return false;
  }

  return !hasPreferredStackOverlap(job, profile);
}

export function evaluatePolicy(
  job: NormalizedJob,
  profile: CandidateProfile,
): PolicyResult {
  const reasons: string[] = [];
  const combinedRole = `${job.title ?? ""} ${job.seniority}`;
  const combinedLocation = `${job.location ?? ""} ${job.remoteType}`;

  if (job.platform === "linkedin" && job.applicationType !== "easy_apply") {
    reasons.push("Only LinkedIn Easy Apply jobs are allowed in this phase.");
  }

  const excludedRole = includesAny(combinedRole, profile.excludedRoles);
  if (excludedRole) {
    reasons.push(`Role excluded by profile: ${excludedRole}.`);
  }

  const disallowedRoleKeyword = includesRoleKeyword(
    combinedRole,
    profile.disallowedRoleKeywords,
  );
  if (disallowedRoleKeyword) {
    reasons.push(`Role family excluded by profile: ${disallowedRoleKeyword}.`);
  }

  if (isPureJavaRole(job, profile)) {
    reasons.push("Role family excluded by profile: pure Java role without target stack overlap.");
  }

  const excludedLocation = includesAny(combinedLocation, profile.excludedLocations);
  if (excludedLocation) {
    reasons.push(`Location excluded by profile: ${excludedLocation}.`);
  }

  if (job.remoteType === "onsite") {
    reasons.push("On-site roles are blocked by profile.");
  }

  if (job.remoteType === "hybrid") {
    const allowedHybridLocation = includesAllowedHybridLocation(
      job.location,
      profile.allowedHybridLocations,
    );

    if (!allowedHybridLocation) {
      reasons.push(
        `Hybrid roles are only allowed in: ${profile.allowedHybridLocations.join(", ")}.`,
      );
    }
  }

  if (profile.visaRequirement === "required" && job.visaSponsorship === "no") {
    reasons.push("Visa sponsorship mismatch.");
  }

  if (
    profile.workAuthorizationStatus === "unknown" &&
    job.workAuthorization === "unknown"
  ) {
    reasons.push("Work authorization is unknown.");
  }

  if (job.openQuestionsCount > 2) {
    reasons.push(`Too many open questions: ${job.openQuestionsCount}.`);
  }

  const missingRequired = [
    !job.title && "title",
    !job.company && "company",
    !job.location && "location",
  ].filter(Boolean);

  if (missingRequired.length > 0) {
    reasons.push(`Missing required fields: ${missingRequired.join(", ")}.`);
  }

  return {
    allowed: reasons.length === 0,
    reasons,
  };
}
