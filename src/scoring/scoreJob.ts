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

function scoreSkill(job: NormalizedJob, profile: CandidateProfile): number {
  const mustHaveRatio = overlapRatio(job.mustHaveSkills, profile.preferredTechStack);
  const techOverlap = overlapRatio(
    [...job.mustHaveSkills, ...job.technologies],
    profile.preferredTechStack,
  );
  const aspirationalOverlap = overlapRatio(
    [...job.mustHaveSkills, ...job.technologies],
    profile.aspirationalTechStack,
  );

  return Math.round(mustHaveRatio * 18 + techOverlap * 12 + aspirationalOverlap * 8);
}

function scoreSeniority(job: NormalizedJob, profile: CandidateProfile): number {
  const years = profile.yearsOfExperience;

  if (job.seniority === "unknown") {
    return 8;
  }

  if (["staff", "principal"].includes(job.seniority)) {
    return 0;
  }

  if (job.seniority === "lead") {
    return years >= 6 ? 8 : 2;
  }

  if (job.seniority === "senior") {
    return years >= 5 ? 10 : 3;
  }

  if (job.seniority === "mid") {
    return years >= 2 && years <= 6 ? 20 : 12;
  }

  if (job.seniority === "junior") {
    return years <= 4 ? 18 : 10;
  }

  if (job.seniority === "intern") {
    return years === 0 ? 12 : 4;
  }

  return 8;
}

function scoreLocation(job: NormalizedJob, profile: CandidateProfile): number {
  const location = `${job.location ?? ""} ${job.remoteType}`.toLowerCase();

  if (job.remoteType === "remote") {
    return 20;
  }

  if (job.remoteType === "onsite") {
    return 0;
  }

  if (job.remoteType === "hybrid") {
    const allowedHybridLocation = profile.allowedHybridLocations.some((preferred) =>
      location.includes(preferred.toLowerCase()),
    );

    return allowedHybridLocation ? 14 : 2;
  }

  if (profile.remotePreference === "remote") {
    return 8;
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

function scoreBonus(job: NormalizedJob, profile: CandidateProfile): number {
  const niceToHave = overlapRatio(job.niceToHaveSkills, profile.preferredTechStack) * 6;
  const aspirationalNiceToHave =
    overlapRatio(job.niceToHaveSkills, profile.aspirationalTechStack) * 3;
  const roleMatch = profile.preferredRoles.some((role) =>
    (job.title ?? "").toLowerCase().includes(role.toLowerCase()),
  )
    ? 4
    : 0;
  const roleSignalOverlap =
    overlapRatio(
      [job.title ?? "", ...job.mustHaveSkills, ...job.niceToHaveSkills, ...job.technologies],
      profile.preferredRoleOverlapSignals ?? [],
    ) * 6;

  return Math.round(niceToHave + aspirationalNiceToHave + roleMatch + roleSignalOverlap);
}

export function scoreJob(job: NormalizedJob, profile: CandidateProfile): JobScore {
  const breakdown = {
    skill: scoreSkill(job, profile),
    seniority: scoreSeniority(job, profile),
    location: scoreLocation(job, profile),
    tech: scoreTech(job, profile),
    bonus: scoreBonus(job, profile),
  };

  return {
    breakdown,
    baselineScore:
      breakdown.skill +
      breakdown.seniority +
      breakdown.location +
      breakdown.tech +
      breakdown.bonus,
    aiAdjustment: 0,
    scoringSource: "deterministic",
    totalScore: Math.max(
      0,
      Math.min(
        100,
        breakdown.skill +
          breakdown.seniority +
          breakdown.location +
          breakdown.tech +
          breakdown.bonus,
      ),
    ),
  };
}
