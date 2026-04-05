import type { NormalizedJob } from "../domain/job.js";
import type { CandidateProfile } from "../profile/candidate.js";

export type PolicyResult = {
  allowed: boolean;
  reasons: string[];
};

export type PolicyEvaluationOptions = {
  allowExternalLinkedInApply?: boolean;
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
];

const EUROPE_REGION_LABELS = new Set([
  "europe",
  "eu",
  "european union",
  "eea",
  "emea",
]);

function trimOrNull(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function normalizePolicyText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function includesAny(haystack: string, needles: string[]): string | null {
  const normalizedHaystack = normalizePolicyText(haystack);

  for (const needle of needles) {
    const normalizedNeedle = normalizePolicyText(needle);
    if (!normalizedNeedle) {
      continue;
    }

    if (normalizedHaystack.includes(normalizedNeedle)) {
      return needle;
    }
  }

  return null;
}

function includesAllowedHybridLocation(
  location: string | null,
  allowedHybridLocations: string[],
): string | null {
  const normalizedLocation = normalizePolicyText(location);

  for (const allowedLocation of allowedHybridLocations) {
    const normalizedAllowedLocation = normalizePolicyText(allowedLocation);
    if (!normalizedAllowedLocation) {
      continue;
    }

    if (normalizedLocation.includes(normalizedAllowedLocation)) {
      return allowedLocation;
    }
  }

  return null;
}

function includesRoleKeyword(haystack: string, keywords: string[]): string | null {
  const normalizedHaystack = normalizePolicyText(haystack);

  for (const keyword of keywords) {
    const normalizedKeyword = normalizePolicyText(keyword);
    if (!normalizedKeyword) {
      continue;
    }

    const pattern = new RegExp(`\\b${escapeRegex(normalizedKeyword)}\\b`, "i");
    if (pattern.test(normalizedHaystack)) {
      return keyword;
    }
  }

  return null;
}

export function hasPreferredStackOverlap(
  job: Pick<NormalizedJob, "title" | "technologies" | "mustHaveSkills" | "niceToHaveSkills">,
  profile: Pick<
    CandidateProfile,
    "preferredTechStack" | "aspirationalTechStack" | "preferredRoleOverlapSignals"
  >,
): boolean {
  const haystack = [
    job.title,
    ...job.technologies,
    ...job.mustHaveSkills,
    ...job.niceToHaveSkills,
  ]
    .filter(Boolean)
    .join(" ");

  const normalizedHaystack = normalizePolicyText(haystack);

  if (!normalizedHaystack) {
    return false;
  }

  const preferredSignals = [
    ...profile.preferredTechStack,
    ...profile.aspirationalTechStack,
    ...profile.preferredRoleOverlapSignals,
  ];

  return preferredSignals.some((signal) =>
    normalizedHaystack.includes(normalizePolicyText(signal)),
  );
}

export function isPureJavaRole(
  job: Pick<NormalizedJob, "title" | "technologies" | "mustHaveSkills" | "niceToHaveSkills">,
  profile: Pick<
    CandidateProfile,
    "preferredTechStack" | "aspirationalTechStack" | "preferredRoleOverlapSignals"
  >,
): boolean {
  const title = normalizePolicyText(job.title);
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

export function isEuropeCenteredLocationText(location: string | null | undefined): boolean {
  const normalizedLocation = trimOrNull(location);
  if (!normalizedLocation) {
    return false;
  }

  const foldedLocation = normalizePolicyText(normalizedLocation);
  if (/\bturkiye\b/.test(foldedLocation) || /\bturkey\b/.test(foldedLocation)) {
    return false;
  }

  return EUROPE_LOCATION_PATTERNS.some((pattern) => pattern.test(normalizedLocation));
}

export function matchesConfiguredWorkplacePolicyBypass(
  location: string | null | undefined,
  configuredRegions: string[] | undefined,
): boolean {
  const normalizedLocation = trimOrNull(location);
  if (!normalizedLocation) {
    return false;
  }

  const foldedLocation = normalizePolicyText(normalizedLocation);

  for (const configuredRegion of configuredRegions ?? []) {
    const normalizedRegion = normalizePolicyText(configuredRegion);
    if (!normalizedRegion) {
      continue;
    }

    if (EUROPE_REGION_LABELS.has(normalizedRegion) && isEuropeCenteredLocationText(normalizedLocation)) {
      return true;
    }

    if (foldedLocation.includes(normalizedRegion)) {
      return true;
    }
  }

  return false;
}

export function isEuropeCenteredJob(job: Pick<NormalizedJob, "location">): boolean {
  return isEuropeCenteredLocationText(job.location);
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

export function getMissingRequiredFields(
  job: Pick<NormalizedJob, "title" | "company" | "location">,
): string[] {
  return [
    !job.title && "title",
    !job.company && "company",
    !job.location && "location",
  ].filter((value): value is string => Boolean(value));
}

function buildCombinedRole(job: Pick<NormalizedJob, "title" | "seniority">): string {
  return `${job.title ?? ""} ${job.seniority}`.trim();
}

function buildCombinedLocation(job: Pick<NormalizedJob, "location" | "remoteType">): string {
  return `${job.location ?? ""} ${job.remoteType}`.trim();
}

function collectPlatformReasons(
  job: Pick<NormalizedJob, "platform" | "applicationType">,
  options?: PolicyEvaluationOptions,
): string[] {
  if (
    job.platform === "linkedin" &&
    job.applicationType !== "easy_apply" &&
    !options?.allowExternalLinkedInApply
  ) {
    return ["Only LinkedIn Easy Apply jobs are allowed in this phase."];
  }

  return [];
}

function collectRoleReasons(
  job: Pick<
    NormalizedJob,
    "title" | "seniority" | "technologies" | "mustHaveSkills" | "niceToHaveSkills"
  >,
  profile: Pick<
    CandidateProfile,
    | "excludedRoles"
    | "disallowedRoleKeywords"
    | "preferredTechStack"
    | "aspirationalTechStack"
    | "preferredRoleOverlapSignals"
  >,
): string[] {
  const reasons: string[] = [];
  const combinedRole = buildCombinedRole(job);

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

  return reasons;
}

function collectLocationReasons(
  job: Pick<NormalizedJob, "location" | "remoteType">,
  profile: Pick<
    CandidateProfile,
    "excludedLocations" | "allowedHybridLocations" | "workplacePolicyBypassLocations"
  >,
): string[] {
  const reasons: string[] = [];
  const combinedLocation = buildCombinedLocation(job);
  const workplacePolicyBypassed = shouldBypassWorkplacePolicy(job, profile);

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

  return reasons;
}

function collectAuthorizationReasons(
  job: Pick<NormalizedJob, "visaSponsorship" | "workAuthorization">,
  profile: Pick<CandidateProfile, "visaRequirement" | "workAuthorizationStatus">,
): string[] {
  const reasons: string[] = [];

  if (profile.visaRequirement === "required" && job.visaSponsorship === "no") {
    reasons.push("Visa sponsorship mismatch.");
  }

  if (
    profile.workAuthorizationStatus === "unknown" &&
    job.workAuthorization === "unknown"
  ) {
    reasons.push("Work authorization is unknown.");
  }

  return reasons;
}

function collectQualityReasons(
  job: Pick<NormalizedJob, "openQuestionsCount" | "title" | "company" | "location">,
): string[] {
  const reasons: string[] = [];

  if (job.openQuestionsCount > 2) {
    reasons.push(`Too many open questions: ${job.openQuestionsCount}.`);
  }

  const missingRequired = getMissingRequiredFields(job);
  if (missingRequired.length > 0) {
    reasons.push(`Missing required fields: ${missingRequired.join(", ")}.`);
  }

  return reasons;
}

export function collectPolicyReasons(
  job: NormalizedJob,
  profile: CandidateProfile,
  options?: PolicyEvaluationOptions,
): string[] {
  return [
    ...collectPlatformReasons(job, options),
    ...collectRoleReasons(job, profile),
    ...collectLocationReasons(job, profile),
    ...collectAuthorizationReasons(job, profile),
    ...collectQualityReasons(job),
  ];
}

export function evaluatePolicy(
  job: NormalizedJob,
  profile: CandidateProfile,
  options?: PolicyEvaluationOptions,
): PolicyResult {
  const reasons = collectPolicyReasons(job, profile, options);
  return {
    allowed: reasons.length === 0,
    reasons,
  };
}
