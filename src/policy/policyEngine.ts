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
