import type { NormalizedJob } from "../domain/job.js";
import type { CandidateProfile } from "../profile/candidate.js";

export type PolicyResult = {
  allowed: boolean;
  reasons: string[];
};

const EUROPE_LOCATION_PATTERNS = [
  /\beurope\b/i,
  /\beuropean union\b/i,
  /\beu\b/i,
  /\beea\b/i,
  /\bem ea\b/i,
  /\bemea\b/i,
  /\baustria\b/i,
  /\bbelgium\b/i,
  /\bbulgaria\b/i,
  /\bcroatia\b/i,
  /\bcyprus\b/i,
  /\bczech(?:ia| republic)?\b/i,
  /\bdenmark\b/i,
  /\bestonia\b/i,
  /\bfinland\b/i,
  /\bfrance\b/i,
  /\bgermany\b/i,
  /\bgreece\b/i,
  /\bhungary\b/i,
  /\bireland\b/i,
  /\bitaly\b/i,
  /\blatvia\b/i,
  /\blithuania\b/i,
  /\bluxembourg\b/i,
  /\bmalta\b/i,
  /\bnetherlands\b/i,
  /\bpoland\b/i,
  /\bportugal\b/i,
  /\bromania\b/i,
  /\bslovakia\b/i,
  /\bslovenia\b/i,
  /\bspain\b/i,
  /\bsweden\b/i,
  /\bnorway\b/i,
  /\bswitzerland\b/i,
  /\buk\b/i,
  /\bunited kingdom\b/i,
  /\bengland\b/i,
  /\bscotland\b/i,
  /\bwales\b/i,
  /\bnorthern ireland\b/i,
  /\bturkiye\b/i,
  /\btürkiye\b/i,
  /\bturkey\b/i,
];

const EUROPE_REGION_LABELS = new Set([
  "europe",
  "eu",
  "european union",
  "eea",
  "emea",
]);

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

function isEuropeCenteredLocation(location: string | null | undefined): boolean {
  const normalizedLocation = location?.trim();
  if (!normalizedLocation) {
    return false;
  }

  return EUROPE_LOCATION_PATTERNS.some((pattern) => pattern.test(normalizedLocation));
}

function matchesConfiguredWorkplacePolicyBypass(
  location: string | null | undefined,
  configuredRegions: string[] | undefined,
): boolean {
  const normalizedLocation = location?.trim();
  if (!normalizedLocation) {
    return false;
  }

  for (const configuredRegion of configuredRegions ?? []) {
    const normalizedRegion = configuredRegion.trim().toLowerCase();
    if (!normalizedRegion) {
      continue;
    }

    if (EUROPE_REGION_LABELS.has(normalizedRegion) && isEuropeCenteredLocation(normalizedLocation)) {
      return true;
    }

    if (normalizedLocation.toLowerCase().includes(normalizedRegion)) {
      return true;
    }
  }

  return false;
}

export function isEuropeCenteredJob(job: Pick<NormalizedJob, "location">): boolean {
  const location = job.location?.trim();
  if (!location) {
    return false;
  }

  return isEuropeCenteredLocation(location);
}

export function shouldBypassWorkplacePolicy(
  job: Pick<NormalizedJob, "location">,
  profile: Pick<CandidateProfile, "workplacePolicyBypassLocations">,
): boolean {
  return matchesConfiguredWorkplacePolicyBypass(
    job.location,
    profile.workplacePolicyBypassLocations,
  );
}

export function evaluatePolicy(
  job: NormalizedJob,
  profile: CandidateProfile,
): PolicyResult {
  const reasons: string[] = [];
  const combinedRole = `${job.title ?? ""} ${job.seniority}`;
  const combinedLocation = `${job.location ?? ""} ${job.remoteType}`;
  const workplacePolicyBypassed = shouldBypassWorkplacePolicy(job, profile);

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

  if (!workplacePolicyBypassed && job.remoteType === "onsite") {
    reasons.push("On-site roles are blocked by profile.");
  }

  if (!workplacePolicyBypassed && job.remoteType === "hybrid") {
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
