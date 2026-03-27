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

export function evaluatePolicy(
  job: NormalizedJob,
  profile: CandidateProfile,
): PolicyResult {
  const reasons: string[] = [];
  const combinedRole = `${job.title ?? ""} ${job.seniority}`;
  const combinedLocation = `${job.location ?? ""} ${job.remoteType}`;

  const excludedRole = includesAny(combinedRole, profile.excludedRoles);
  if (excludedRole) {
    reasons.push(`Role excluded by profile: ${excludedRole}.`);
  }

  const excludedLocation = includesAny(combinedLocation, profile.excludedLocations);
  if (excludedLocation) {
    reasons.push(`Location excluded by profile: ${excludedLocation}.`);
  }

  if (
    (job.location ?? "").toLowerCase().includes("istanbul") &&
    job.remoteType === "onsite"
  ) {
    reasons.push("Istanbul onsite roles are blocked by policy.");
  }

  if (profile.visaRequirement === "required" && job.visaSponsorship === "no") {
    reasons.push("Visa sponsorship mismatch.");
  }

  if (profile.workAuthorizationStatus === "unknown" || job.workAuthorization === "unknown") {
    reasons.push("Work authorization is unknown.");
  }

  if (job.openQuestionsCount > 2) {
    reasons.push(`Too many open questions: ${job.openQuestionsCount}.`);
  }

  const missingRequired = [
    !job.title && "title",
    !job.company && "company",
    !job.location && "location",
    job.remoteType === "unknown" && "remoteType",
    job.seniority === "unknown" && "seniority",
  ].filter(Boolean);

  if (missingRequired.length > 0) {
    reasons.push(`Missing required fields: ${missingRequired.join(", ")}.`);
  }

  return {
    allowed: reasons.length === 0,
    reasons,
  };
}
