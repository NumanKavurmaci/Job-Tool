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
};

function hasCaseInsensitiveMatch(values: string[], target: string): boolean {
  const normalizedTarget = target.toLowerCase();
  return values.some((value) => value.toLowerCase() === normalizedTarget);
}

function hasSubstringMatch(values: string[], pattern: RegExp): boolean {
  return values.some((value) => pattern.test(value));
}

function overlapRatio(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const rightSet = new Set(right.map((value) => value.toLowerCase()));
  const matches = left.filter((value) => rightSet.has(value.toLowerCase())).length;

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

  return Math.round(mustHaveRatio * 18 + techOverlap * 12 + aspirationalOverlap * 5);
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
    overlapRatio(job.technologies, profile.aspirationalTechStack) * 3;

  return Math.round(preferredTechScore + aspirationalTechScore);
}

function scoreBonus(job: NormalizedJob, profile: CandidateProfile): number {
  const niceToHave = overlapRatio(job.niceToHaveSkills, profile.preferredTechStack) * 6;
  const aspirationalNiceToHave =
    overlapRatio(job.niceToHaveSkills, profile.aspirationalTechStack) * 2;
  const roleMatch = profile.preferredRoles.some((role) =>
    (job.title ?? "").toLowerCase().includes(role.toLowerCase()),
  )
    ? 4
    : 0;
  const roleSignals = uniqueLowercase([job.title, ...job.mustHaveSkills, ...job.technologies]);
  const isFullStackRole = /\bfull\s*-?\s*stack\b/i.test(job.title ?? "");
  const hasNode = hasCaseInsensitiveMatch(roleSignals, "node.js");
  const hasTypeScript = hasCaseInsensitiveMatch(roleSignals, "typescript");
  const hasReact = hasCaseInsensitiveMatch(roleSignals, "react") || hasCaseInsensitiveMatch(roleSignals, "react.js");
  const hasApiOrMicroservices =
    hasSubstringMatch(roleSignals, /\bapi\b/i) ||
    hasSubstringMatch(roleSignals, /\bmicroservice/i);
  const fullStackAdjacencyBonus =
    isFullStackRole && hasNode && hasTypeScript && hasReact && hasApiOrMicroservices ? 8 : 0;

  return Math.round(niceToHave + aspirationalNiceToHave + roleMatch + fullStackAdjacencyBonus);
}

function uniqueLowercase(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized) {
      continue;
    }

    const lowered = normalized.toLowerCase();
    if (seen.has(lowered)) {
      continue;
    }

    seen.add(lowered);
    result.push(normalized);
  }

  return result;
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
