import type { JobScore } from "./scoreJob.js";

export type JobDecision = {
  decision: "APPLY" | "MAYBE" | "SKIP";
  reason: string;
};

export function decideJob(score: JobScore): JobDecision {
  if (score.totalScore >= 75) {
    return {
      decision: "APPLY",
      reason: `Strong fit with a score of ${score.totalScore}.`,
    };
  }

  if (score.totalScore >= 55) {
    return {
      decision: "MAYBE",
      reason: `Promising but not strong enough yet with a score of ${score.totalScore}.`,
    };
  }

  return {
    decision: "SKIP",
    reason: `Low fit score of ${score.totalScore}.`,
  };
}
