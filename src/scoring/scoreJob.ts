import type { NormalizedJob } from "../domain/job.js";
import type { CandidateProfile } from "../profile/candidate.js";

export type JobScore = {
  totalScore: number;
  breakdown: {
    skill: number;
    seniority: number;
    location: number;
    tech: number;
    bonus: number;
  };
  baselineScore?: number;
  aiAdjustment?: number;
  aiReasoning?: string;
  aiConfidence?: "low" | "medium" | "high";
  scoringSource?: "deterministic" | "deterministic+ai";
};

const TERM_ALIASES: Record<string, string> = {
  "react.js": "react",
  reactjs: "react",
  "node": "node.js",
  "node js": "node.js",
  "tailwindcss": "tailwind",
  "tailwind css": "tailwind",
  "nextjs": "next.js",
  "javascript/typescript": "typescript",
  "js/ts": "typescript",
  "restful api": "api",
  "restful apis": "api",
  "rest api": "api",
  "rest apis": "api",
  apis: "api",
  microservice: "microservices",
  "microservices architecture": "microservices",
  "ci cd": "ci/cd",
  "ci-cd": "ci/cd",
  "cicd": "ci/cd",
  "frontend": "front-end",
  "fullstack": "full stack",
  "html5": "html",
  "css3": "css",
};

const TESTING_ROLE_KEYWORDS = new Set(["qa", "qc", "test"]);
const STACK_MISMATCH_KEYWORDS = new Set([
  "sap",
  "abap",
  "sapui5",
  "ios",
  "android",
  "php",
  "java",
  "mechanical",
  "researcher",
]);
const FOUNDING_ROLE_PATTERNS = [
  /\bfounding\b/i,
  /\bfirst engineer(?:ing)? hire\b/i,
  /\bearly engineering hire\b/i,
  /\bfounding engineer\b/i,
];
const OWNERSHIP_HEAVY_PATTERNS = [
  /\bown (?:the )?architecture\b/i,
  /\bshape (?:the )?technical direction\b/i,
  /\bset (?:the )?technical direction\b/i,
  /\bbuild (?:the )?engineering culture\b/i,
];

function normalizeTerm(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[()"'`]/g, " ")
    .replace(/[–—-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return TERM_ALIASES[normalized] ?? normalized;
}

function expandTerms(values: string[]): string[][] {
  return values
    .map((value) =>
      value
        .split(/[;,]|(?:\s+and\s+)|\//i)
        .map((part) => normalizeTerm(part))
        .filter(Boolean),
    )
    .filter((parts) => parts.length > 0);
}

function overlapRatio(left: string[] = [], right: string[] = []): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const leftTerms = expandTerms(left);
  const rightSet = new Set(expandTerms(right).flat());
  const matches = leftTerms.filter((terms) =>
    terms.some((term) => rightSet.has(term)),
  ).length;

  return matches / left.length;
}

type AlignmentSignals = {
  mustHaveRatio: number;
  techOverlap: number;
  aspirationalOverlap: number;
  roleSignalOverlap: number;
  preferredRoleMatch: boolean;
  coreAlignment: number;
};

function buildJobText(job: Pick<NormalizedJob, "title" | "mustHaveSkills" | "niceToHaveSkills" | "technologies">): string {
  return [
    job.title ?? "",
    ...job.mustHaveSkills,
    ...job.niceToHaveSkills,
    ...job.technologies,
  ]
    .map((value) => normalizeTerm(value))
    .join(" ");
}

function includesKeyword(text: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

function hasTestingRoleSignal(text: string): boolean {
  return /\b(?:qa|qc|test|testing|quality assurance)\b/i.test(text);
}

function getAlignmentSignals(job: NormalizedJob, profile: CandidateProfile): AlignmentSignals {
  const mustHaveRatio = overlapRatio(job.mustHaveSkills, profile.preferredTechStack);
  const techOverlap = overlapRatio(
    [...job.mustHaveSkills, ...job.technologies],
    profile.preferredTechStack,
  );
  const aspirationalOverlap = overlapRatio(
    [...job.mustHaveSkills, ...job.technologies],
    profile.aspirationalTechStack,
  );
  const roleSignalOverlap = overlapRatio(
    [job.title ?? "", ...job.mustHaveSkills, ...job.niceToHaveSkills, ...job.technologies],
    profile.preferredRoleOverlapSignals ?? [],
  );
  const preferredRoleMatch = profile.preferredRoles.some((role) =>
    (job.title ?? "").toLowerCase().includes(role.toLowerCase()),
  );
  const coreAlignment = Math.max(
    mustHaveRatio,
    techOverlap,
    aspirationalOverlap * 0.75,
    roleSignalOverlap * 0.8,
    preferredRoleMatch ? 0.18 : 0,
  );

  return {
    mustHaveRatio,
    techOverlap,
    aspirationalOverlap,
    roleSignalOverlap,
    preferredRoleMatch,
    coreAlignment,
  };
}

function scoreSkill(job: NormalizedJob, profile: CandidateProfile, signals: AlignmentSignals): number {
  return Math.round(
    signals.mustHaveRatio * 18 + signals.techOverlap * 12 + signals.aspirationalOverlap * 8,
  );
}

function scoreSeniority(
  job: NormalizedJob,
  profile: CandidateProfile,
  signals: AlignmentSignals,
): number {
  const years = profile.yearsOfExperience;

  if (job.seniority === "unknown") {
    return signals.coreAlignment >= 0.25 ? 8 : 6;
  }

  if (["staff", "principal"].includes(job.seniority)) {
    return 0;
  }

  if (job.seniority === "lead") {
    return years >= 6 ? 8 : 2;
  }

  if (job.seniority === "senior") {
    if (years >= 5) {
      return signals.coreAlignment >= 0.25 ? 10 : 6;
    }

    return signals.coreAlignment >= 0.25 ? 3 : 2;
  }

  if (job.seniority === "mid") {
    if (years >= 2 && years <= 6) {
      if (signals.coreAlignment >= 0.35) {
        return 20;
      }

      if (signals.coreAlignment >= 0.18) {
        return 16;
      }

      return 12;
    }

    return signals.coreAlignment >= 0.18 ? 12 : 8;
  }

  if (job.seniority === "junior") {
    return years <= 4 ? (signals.coreAlignment >= 0.15 ? 18 : 14) : 10;
  }

  if (job.seniority === "intern") {
    return years === 0 ? 12 : 4;
  }

  return 8;
}

function scoreLocation(
  job: NormalizedJob,
  profile: CandidateProfile,
  signals: AlignmentSignals,
): number {
  const location = `${job.location ?? ""} ${job.remoteType}`.toLowerCase();

  if (job.remoteType === "remote") {
    if (signals.coreAlignment >= 0.35) {
      return 20;
    }

    if (signals.coreAlignment >= 0.18) {
      return 16;
    }

    return 12;
  }

  if (job.remoteType === "onsite") {
    return 0;
  }

  if (job.remoteType === "hybrid") {
    const allowedHybridLocation = profile.allowedHybridLocations.some((preferred) =>
      location.includes(preferred.toLowerCase()),
    );

    if (!allowedHybridLocation) {
      return 2;
    }

    if (signals.coreAlignment >= 0.35) {
      return 14;
    }

    if (signals.coreAlignment >= 0.18) {
      return 10;
    }

    return 6;
  }

  if (profile.remotePreference === "remote") {
    return signals.coreAlignment >= 0.18 ? 8 : 5;
  }

  const preferredLocationMatch = profile.preferredLocations.some((preferred) =>
    location.includes(preferred.toLowerCase()),
  );

  return preferredLocationMatch ? 16 : job.remoteType === "unknown" ? 8 : 10;
}

function scoreTech(job: NormalizedJob, profile: CandidateProfile): number {
  const preferredTechScore =
    overlapRatio(job.technologies, profile.preferredTechStack) * 12;
  const aspirationalTechScore =
    overlapRatio(job.technologies, profile.aspirationalTechStack) * 5;

  return Math.round(preferredTechScore + aspirationalTechScore);
}

function scoreRolePenalty(
  job: NormalizedJob,
  profile: CandidateProfile,
  signals: AlignmentSignals,
): number {
  const jobText = buildJobText(job);
  let penalty = 0;

  for (const keyword of profile.disallowedRoleKeywords ?? []) {
    const normalizedKeyword = normalizeTerm(keyword);
    if (!normalizedKeyword || !includesKeyword(jobText, normalizedKeyword)) {
      if (TESTING_ROLE_KEYWORDS.has(normalizedKeyword) && hasTestingRoleSignal(jobText)) {
        penalty = Math.max(penalty, 18);
      }

      continue;
    }

    if (TESTING_ROLE_KEYWORDS.has(normalizedKeyword)) {
      penalty = Math.max(penalty, 18);
      continue;
    }

    if (STACK_MISMATCH_KEYWORDS.has(normalizedKeyword) && signals.coreAlignment < 0.3) {
      penalty = Math.max(penalty, 12);
    }
  }

  if (FOUNDING_ROLE_PATTERNS.some((pattern) => pattern.test(job.title ?? ""))) {
    penalty += 10;
  }

  const jobTextWithTitle = `${job.title ?? ""} ${jobText}`;
  if (OWNERSHIP_HEAVY_PATTERNS.some((pattern) => pattern.test(jobTextWithTitle))) {
    penalty += 6;
  }

  if (
    job.remoteType === "remote" &&
    ["mid", "unknown"].includes(job.seniority) &&
    signals.coreAlignment < 0.18 &&
    job.mustHaveSkills.length <= 2 &&
    !signals.preferredRoleMatch
  ) {
    penalty += 8;
  }

  return penalty;
}

function scoreBonus(job: NormalizedJob, profile: CandidateProfile, signals: AlignmentSignals): number {
  const niceToHave = overlapRatio(job.niceToHaveSkills, profile.preferredTechStack) * 6;
  const aspirationalNiceToHave =
    overlapRatio(job.niceToHaveSkills, profile.aspirationalTechStack) * 3;
  const roleMatch = signals.preferredRoleMatch ? 4 : 0;
  const roleSignalOverlap = signals.roleSignalOverlap * 6;
  const rolePenalty = scoreRolePenalty(job, profile, signals);

  return Math.round(
    niceToHave + aspirationalNiceToHave + roleMatch + roleSignalOverlap - rolePenalty,
  );
}

function capScoreForRoleRisk(
  job: NormalizedJob,
  profile: CandidateProfile,
  signals: AlignmentSignals,
  baselineScore: number,
): number {
  const jobText = buildJobText(job);
  let cappedScore = baselineScore;

  if (hasTestingRoleSignal(jobText)) {
    cappedScore = Math.min(cappedScore, 35);
  }

  if (FOUNDING_ROLE_PATTERNS.some((pattern) => pattern.test(job.title ?? ""))) {
    cappedScore = Math.min(cappedScore, 40);
  }

  if (
    job.remoteType === "remote" &&
    ["mid", "unknown"].includes(job.seniority) &&
    signals.coreAlignment <= 0.18 &&
    signals.preferredRoleMatch &&
    !job.mustHaveSkills.some((skill) =>
      profile.preferredTechStack.some(
        (preferred) => normalizeTerm(preferred) === normalizeTerm(skill),
      ),
    )
  ) {
    cappedScore = Math.min(cappedScore, 35);
  }

  return cappedScore;
}

export function scoreJob(job: NormalizedJob, profile: CandidateProfile): JobScore {
  const signals = getAlignmentSignals(job, profile);
  const breakdown = {
    skill: scoreSkill(job, profile, signals),
    seniority: scoreSeniority(job, profile, signals),
    location: scoreLocation(job, profile, signals),
    tech: scoreTech(job, profile),
    bonus: scoreBonus(job, profile, signals),
  };
  const baselineScore =
    breakdown.skill +
    breakdown.seniority +
    breakdown.location +
    breakdown.tech +
    breakdown.bonus;
  const cappedScore = capScoreForRoleRisk(job, profile, signals, baselineScore);

  return {
    breakdown,
    baselineScore,
    aiAdjustment: 0,
    scoringSource: "deterministic",
    totalScore: Math.max(0, Math.min(100, cappedScore)),
  };
}
