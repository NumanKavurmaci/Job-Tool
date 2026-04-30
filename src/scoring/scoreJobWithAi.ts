import type { NormalizedJob } from "../domain/job.js";
import type { CandidateProfile } from "../profile/candidate.js";
import { scoreJob, type JobScore } from "./scoreJob.js";

export type AiScoreBreakdown = {
  skill: number;
  seniority: number;
  location: number;
  tech: number;
  bonus: number;
};

export type AiScoreResult = {
  score: number;
  rationale: string;
  confidence: "low" | "medium" | "high";
  breakdown?: Partial<AiScoreBreakdown>;
};

type ScoreJobWithAiArgs = {
  job: NormalizedJob;
  profile: CandidateProfile;
  completePrompt: (prompt: string) => Promise<{ text: string }>;
  logger?: {
    info?: (object: Record<string, unknown>, message?: string) => void;
    warn?: (object: Record<string, unknown>, message?: string) => void;
  };
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampBreakdownValue(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numeric) ? clamp(Math.round(numeric), -25, 100) : 0;
}

function buildScoringPrompt(job: NormalizedJob, profile: CandidateProfile): string {
  return [
    "You are scoring a software job for a candidate.",
    "You must return JSON only with this shape:",
    '{"score": number, "rationale": string, "confidence": "low" | "medium" | "high", "breakdown": {"skill": number, "seniority": number, "location": number, "tech": number, "bonus": number}}',
    "Score must be an integer between 0 and 100.",
    "Breakdown values should explain the score, but the total score is authoritative.",
    "Use semantic evaluation, not just exact keyword overlap.",
    "Reward credible overlap across backend, frontend, full-stack, platform, automation, and cloud.",
    "Do not let one secondary technology erase a strong primary stack match.",
    "Do not compensate for hard policy blockers like on-site mismatch or missing required fields.",
    "",
    `Job title: ${job.title ?? "unknown"}`,
    `Job company: ${job.company ?? "unknown"}`,
    `Job location: ${job.location ?? "unknown"}`,
    `Job remote type: ${job.remoteType}`,
    `Job seniority: ${job.seniority}`,
    `Job must-have skills: ${job.mustHaveSkills.join(", ") || "none"}`,
    `Job nice-to-have skills: ${job.niceToHaveSkills.join(", ") || "none"}`,
    `Job technologies: ${job.technologies.join(", ") || "none"}`,
    "",
    `Candidate years of experience: ${profile.yearsOfExperience}`,
    `Candidate preferred roles: ${profile.preferredRoles.join(", ") || "none"}`,
    `Candidate preferred tech stack: ${profile.preferredTechStack.join(", ") || "none"}`,
    `Candidate aspirational tech stack: ${profile.aspirationalTechStack.join(", ") || "none"}`,
    `Candidate role overlap signals: ${profile.preferredRoleOverlapSignals.join(", ") || "none"}`,
    "",
    "Respond with JSON only.",
  ].join("\n");
}

export function parseAiScoreAdjustment(text: string): AiScoreResult {
  const parsed = JSON.parse(text) as Partial<AiScoreResult>;
  const rawScore = typeof parsed.score === "number" ? parsed.score : Number(parsed.score ?? 0);
  const score = clamp(Number.isFinite(rawScore) ? Math.round(rawScore) : 0, 0, 100);

  return {
    score,
    rationale:
      typeof parsed.rationale === "string" && parsed.rationale.trim()
        ? parsed.rationale.trim()
        : "AI job scoring did not include a rationale.",
    confidence:
      parsed.confidence === "low" ||
      parsed.confidence === "medium" ||
      parsed.confidence === "high"
        ? parsed.confidence
        : "medium",
    ...(parsed.breakdown && typeof parsed.breakdown === "object"
      ? {
          breakdown: {
            skill: clampBreakdownValue(parsed.breakdown.skill),
            seniority: clampBreakdownValue(parsed.breakdown.seniority),
            location: clampBreakdownValue(parsed.breakdown.location),
            tech: clampBreakdownValue(parsed.breakdown.tech),
            bonus: clampBreakdownValue(parsed.breakdown.bonus),
          },
        }
      : {}),
  };
}

export async function scoreJobWithAi(args: ScoreJobWithAiArgs): Promise<JobScore> {
  try {
    const response = await args.completePrompt(buildScoringPrompt(args.job, args.profile));
    const ai = parseAiScoreAdjustment(response.text);

    args.logger?.info?.(
      {
        event: "scoring.ai_score.applied",
        totalScore: ai.score,
        confidence: ai.confidence,
      },
      "Applied AI job score",
    );

    return {
      totalScore: ai.score,
      breakdown: {
        skill: ai.breakdown?.skill ?? 0,
        seniority: ai.breakdown?.seniority ?? 0,
        location: ai.breakdown?.location ?? 0,
        tech: ai.breakdown?.tech ?? 0,
        bonus: ai.breakdown?.bonus ?? 0,
      },
      aiReasoning: ai.rationale,
      aiConfidence: ai.confidence,
      scoringSource: "llm",
    };
  } catch (error) {
    args.logger?.warn?.(
      {
        event: "scoring.ai_score.failed",
        reason: error instanceof Error ? error.message : String(error),
      },
      "AI job scoring failed, falling back to deterministic score",
    );

    return scoreJob(args.job, args.profile);
  }
}
