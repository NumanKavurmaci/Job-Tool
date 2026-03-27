import type { CandidateProfile } from "../../candidate/types.js";
import type { ResolvedAnswer } from "../../answers/types.js";
import type { ClassifiedQuestion } from "../types.js";
import { labelConfidence } from "../../answers/confidence.js";

export function resolveDeterministicAnswer(
  question: ClassifiedQuestion,
  profile: CandidateProfile,
): ResolvedAnswer | null {
  switch (question.type) {
    case "linkedin":
      return {
        questionType: question.type,
        strategy: "deterministic",
        answer: profile.linkedinUrl,
        confidence: 0.98,
        confidenceLabel: labelConfidence(0.98),
        source: "candidate-profile",
      };
    case "contact_info":
      {
        const wantsPhone = /\b(phone|mobile|cell)\b/.test(question.normalizedText);
        const wantsEmail = /\bemail\b/.test(question.normalizedText);
        const answer = wantsPhone
          ? profile.phone
          : wantsEmail
            ? profile.email
            : profile.email ?? profile.phone;

        return {
          questionType: question.type,
          strategy: "deterministic",
          answer,
          confidence: answer ? 0.95 : 0.4,
          confidenceLabel: labelConfidence(answer ? 0.95 : 0.4, !answer),
          source: answer ? "candidate-profile" : "manual",
        };
      }
    case "work_authorization":
      return {
        questionType: question.type,
        strategy: "deterministic",
        answer: profile.workAuthorization,
        confidence: 0.9,
        confidenceLabel: labelConfidence(0.9),
        source: "candidate-profile",
      };
    case "sponsorship":
      return {
        questionType: question.type,
        strategy: "deterministic",
        answer: profile.requiresSponsorship,
        confidence: profile.requiresSponsorship == null ? 0.3 : 0.95,
        confidenceLabel: labelConfidence(
          profile.requiresSponsorship == null ? 0.3 : 0.95,
          profile.requiresSponsorship == null,
        ),
        source: profile.requiresSponsorship == null ? "manual" : "candidate-profile",
        ...(profile.requiresSponsorship == null
          ? { notes: ["Requires human confirmation."] }
          : {}),
      };
    case "relocation":
      return {
        questionType: question.type,
        strategy: "deterministic",
        answer: profile.willingToRelocate,
        confidence: profile.willingToRelocate == null ? 0.3 : 0.9,
        confidenceLabel: labelConfidence(
          profile.willingToRelocate == null ? 0.3 : 0.9,
          profile.willingToRelocate == null,
        ),
        source: profile.willingToRelocate == null ? "manual" : "candidate-profile",
      };
    case "location":
      return {
        questionType: question.type,
        strategy: "deterministic",
        answer: profile.location,
        confidence: profile.location ? 0.9 : 0.4,
        confidenceLabel: labelConfidence(profile.location ? 0.9 : 0.4, !profile.location),
        source: profile.location ? "candidate-profile" : "manual",
      };
    default:
      return null;
  }
}
