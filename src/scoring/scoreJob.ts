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

  return Math.round(mustHaveRatio * 20 + techOverlap * 15);
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
  return Math.round(overlapRatio(job.technologies, profile.preferredTechStack) * 15);
}

function scoreBonus(job: NormalizedJob, profile: CandidateProfile): number {
  const niceToHave = overlapRatio(job.niceToHaveSkills, profile.preferredTechStack) * 6;
  const roleMatch = profile.preferredRoles.some((role) =>
    (job.title ?? "").toLowerCase().includes(role.toLowerCase()),
  )
    ? 4
    : 0;

  return Math.round(niceToHave + roleMatch);
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
