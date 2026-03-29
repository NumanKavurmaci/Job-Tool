import type { NormalizedJob } from "../domain/job.js";
import type { CandidateProfile } from "../profile/candidate.js";
import { scoreJob, type JobScore } from "./scoreJob.js";

export type AiScoreAdjustment = {
  adjustment: number;
  rationale: string;
  confidence: "low" | "medium" | "high";
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

const AI_ADJUSTMENT_LIMIT = 15;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function buildScoringPrompt(job: NormalizedJob, profile: CandidateProfile): string {
  return [
    "You are refining a job-fit score for a software candidate.",
    "You must return JSON only with this shape:",
    '{"adjustment": number, "rationale": string, "confidence": "low" | "medium" | "high"}',
    `The adjustment must be an integer between -${AI_ADJUSTMENT_LIMIT} and ${AI_ADJUSTMENT_LIMIT}.`,
    "Use the adjustment to capture semantic fit and transferable overlap that exact keyword scoring can miss.",
    "Do not overfit to one specific role family.",
    "Reward strong adjacency across frontend, backend, full-stack, platform, automation, and cloud when the overlap is credible.",
    "Do not compensate for hard policy issues like on-site mismatch, missing required fields, or non-Easy Apply constraints.",
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

export function parseAiScoreAdjustment(text: string): AiScoreAdjustment {
  const parsed = JSON.parse(text) as Partial<AiScoreAdjustment>;
  const rawAdjustment =
    typeof parsed.adjustment === "number"
      ? parsed.adjustment
      : Number(parsed.adjustment ?? 0);
  const adjustment = clamp(
    Number.isFinite(rawAdjustment) ? Math.round(rawAdjustment) : 0,
    -AI_ADJUSTMENT_LIMIT,
    AI_ADJUSTMENT_LIMIT,
  );

  return {
    adjustment,
    rationale:
      typeof parsed.rationale === "string" && parsed.rationale.trim()
        ? parsed.rationale.trim()
        : "AI fit adjustment did not include a rationale.",
    confidence:
      parsed.confidence === "low" ||
      parsed.confidence === "medium" ||
      parsed.confidence === "high"
        ? parsed.confidence
        : "medium",
  };
}

export async function scoreJobWithAi(args: ScoreJobWithAiArgs): Promise<JobScore> {
  const baseline = scoreJob(args.job, args.profile);

  try {
    const response = await args.completePrompt(buildScoringPrompt(args.job, args.profile));
    const ai = parseAiScoreAdjustment(response.text);
    const totalScore = clamp((baseline.baselineScore ?? baseline.totalScore) + ai.adjustment, 0, 100);

    args.logger?.info?.(
      {
        event: "scoring.ai_adjustment.applied",
        baselineScore: baseline.baselineScore ?? baseline.totalScore,
        totalScore,
        adjustment: ai.adjustment,
        confidence: ai.confidence,
      },
      "Applied AI fit adjustment",
    );

    return {
      ...baseline,
      totalScore,
      aiAdjustment: ai.adjustment,
      aiReasoning: ai.rationale,
      aiConfidence: ai.confidence,
      scoringSource: "deterministic+ai",
    };
  } catch (error) {
    args.logger?.warn?.(
      {
        event: "scoring.ai_adjustment.failed",
        reason: error instanceof Error ? error.message : String(error),
      },
      "AI fit adjustment failed, falling back to deterministic score",
    );

    return baseline;
  }
}
