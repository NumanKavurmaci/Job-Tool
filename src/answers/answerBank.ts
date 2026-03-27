import type { CandidateProfile } from "../candidate/types.js";
import type { ResolvedAnswer } from "./types.js";

export function buildAnswerBank(profile: CandidateProfile): Record<string, ResolvedAnswer> {
  return {
    linkedin: {
      questionType: "linkedin",
      strategy: "deterministic",
      answer: profile.linkedinUrl,
      confidence: 0.98,
      confidenceLabel: "high",
      source: "candidate-profile",
    },
    work_authorization: {
      questionType: "work_authorization",
      strategy: "deterministic",
      answer: profile.workAuthorization,
      confidence: 0.92,
      confidenceLabel: "high",
      source: "candidate-profile",
    },
    sponsorship: {
      questionType: "sponsorship",
      strategy: "deterministic",
      answer: profile.requiresSponsorship,
      confidence: profile.requiresSponsorship == null ? 0.3 : 0.92,
      confidenceLabel: profile.requiresSponsorship == null ? "manual_review" : "high",
      source: profile.requiresSponsorship == null ? "manual" : "candidate-profile",
    },
  };
}
