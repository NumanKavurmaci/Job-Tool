import type { CandidateProfile } from "../../candidate/types.js";
import type { ResolvedAnswer } from "../../answers/types.js";
import type { ClassifiedQuestion } from "../types.js";
import { labelConfidence } from "../../answers/confidence.js";
import { DEFAULT_CANDIDATE_PROFILE_PATH } from "../../profile/candidate.js";

function getSalaryExpectation(
  profile: CandidateProfile,
  normalizedText: string,
): { value: string | null; key: "usd" | "eur" | "try" | null } {
  if (/\b(eur|euro|euros)\b/.test(normalizedText)) {
    return { value: profile.salaryExpectations.eur, key: "eur" };
  }

  if (/\b(usd|dollar|dollars|\$)\b/.test(normalizedText)) {
    return { value: profile.salaryExpectations.usd, key: "usd" };
  }

  if (/\b(try|tl|turkish lira|lira)\b/.test(normalizedText)) {
    return { value: profile.salaryExpectations.try, key: "try" };
  }

  return { value: null, key: null };
}

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
        const nameParts = (profile.fullName ?? "").trim().split(/\s+/).filter(Boolean);
        const firstName = nameParts[0] ?? null;
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : null;
        const wantsPhone = /\b(phone|mobile|cell)\b/.test(question.normalizedText);
        const wantsEmail = /\bemail\b/.test(question.normalizedText);
        const wantsFirstName = /\bfirst name\b/.test(question.normalizedText);
        const wantsLastName = /\blast name\b/.test(question.normalizedText);
        const wantsFullName = /\bfull name\b/.test(question.normalizedText) || /\bname\b/.test(question.normalizedText);
        const wantsAddress = /\baddress\b/.test(question.normalizedText);
        const answer = wantsPhone
          ? profile.phone
          : wantsEmail
            ? profile.email
            : wantsFirstName
              ? firstName
              : wantsLastName
                ? lastName
                : wantsAddress
                  ? profile.location
                  : wantsFullName
                    ? profile.fullName
                    : profile.email ?? profile.phone ?? profile.fullName ?? profile.location;

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
    case "remote_preference":
      {
        const mentionsHybridOrOnsite = /\b(hybrid|onsite|on-site|office)\b/.test(
          question.normalizedText,
        );
        const mentionsRemote = /\bremote|work remotely\b/.test(question.normalizedText);
        const answer = profile.remoteOnly
          ? mentionsHybridOrOnsite && !mentionsRemote
            ? false
            : mentionsRemote && !mentionsHybridOrOnsite
              ? true
              : "remote only"
          : profile.remotePreference;

        return {
          questionType: question.type,
          strategy: "deterministic",
          answer,
          confidence: answer == null ? 0.3 : 0.95,
          confidenceLabel: labelConfidence(answer == null ? 0.3 : 0.95, answer == null),
          source: answer == null ? "manual" : "candidate-profile",
        };
      }
    case "accessibility":
      if (profile.disability.disclosurePreference === "manual-review") {
        return {
          questionType: question.type,
          strategy: "needs-review",
          answer: null,
          confidence: 0.2,
          confidenceLabel: labelConfidence(0.2, true),
          source: "manual",
          notes: ["Accessibility and disability responses require human confirmation."],
        };
      }

      if (profile.disability.disclosurePreference === "prefer-not-to-say") {
        return {
          questionType: question.type,
          strategy: "deterministic",
          answer: "Prefer not to say",
          confidence: 0.98,
          confidenceLabel: labelConfidence(0.98),
          source: "candidate-profile",
        };
      }

      {
        const disabilityTypes = profile.disability.disabilities.map((item) =>
          item.type.trim().toLowerCase(),
        );
        const asksAccommodation = /accommodation|reasonable accommodation|access needs/.test(
          question.normalizedText,
        );
        const asksVisualDisability =
          /\bvisual|vision|blind|low vision\b/.test(question.normalizedText);
        const hasVisualDisability = disabilityTypes.some((type) =>
          /\bvisual|vision|blind|low vision\b/.test(type),
        );
        const answer = asksAccommodation
          ? profile.disability.requiresAccommodation
          : asksVisualDisability
            ? hasVisualDisability
            : profile.disability.hasDisability;
        const missingAccommodation = asksAccommodation
          && profile.disability.requiresAccommodation == null;

        return {
          questionType: question.type,
          strategy: "deterministic",
          answer,
          confidence: missingAccommodation ? 0.3 : 0.95,
          confidenceLabel: labelConfidence(
            missingAccommodation ? 0.3 : 0.95,
            missingAccommodation,
          ),
          source: missingAccommodation ? "manual" : "candidate-profile",
        };
      }
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
    case "salary":
      {
        const salary = getSalaryExpectation(profile, question.normalizedText);

        if (!salary.key) {
          if (profile.salaryExpectation) {
            return {
              questionType: question.type,
              strategy: "deterministic",
              answer: profile.salaryExpectation,
              confidence: 0.8,
              confidenceLabel: labelConfidence(0.8),
              source: "candidate-profile",
              notes: ["Used the generic salary expectation because the question did not specify a currency."],
            };
          }

          return {
            questionType: question.type,
            strategy: "needs-review",
            answer: null,
            confidence: 0.2,
            confidenceLabel: labelConfidence(0.2, true),
            source: "manual",
            notes: [
              "Salary currency is unclear. Review this answer manually.",
              `If this should be auto-filled, add salary expectations to ${DEFAULT_CANDIDATE_PROFILE_PATH}.`,
            ],
          };
        }

        if (!salary.value) {
          return {
            questionType: question.type,
            strategy: "needs-review",
            answer: null,
            confidence: 0.2,
            confidenceLabel: labelConfidence(0.2, true),
            source: "manual",
            notes: [
              `Missing salary expectation for ${salary.key.toUpperCase()}.`,
              `Update ${DEFAULT_CANDIDATE_PROFILE_PATH} -> salaryExpectations.${salary.key}.`,
            ],
          };
        }

        return {
          questionType: question.type,
          strategy: "deterministic",
          answer: salary.value,
          confidence: 0.95,
          confidenceLabel: labelConfidence(0.95),
          source: "candidate-profile",
        };
      }
    /* c8 ignore start */
    case "availability":
      {
        const asksNotice = /\bnotice(?: period)?\b/.test(question.normalizedText);
        const asksStartDate = /start date|when can you start|available from/.test(
          question.normalizedText,
        );
        const availability = profile.availability ?? {
          noticePeriod: null,
          startDate: null,
          canStartImmediately: null,
        };
        const answer = asksNotice
          ? availability.noticePeriod
          : asksStartDate
            ? availability.canStartImmediately === true
              ? "Immediately"
              : availability.startDate
            : availability.canStartImmediately === true
              ? "Immediately"
              : availability.startDate ?? availability.noticePeriod;

        return {
          questionType: question.type,
          strategy: answer ? "deterministic" : "needs-review",
          answer,
          confidence: answer ? 0.95 : 0.2,
          confidenceLabel: labelConfidence(answer ? 0.95 : 0.2, !answer),
          source: answer ? "candidate-profile" : "manual",
          ...(answer
            ? {}
            : {
                notes: [
                  "Missing profile availability data.",
                  `${DEFAULT_CANDIDATE_PROFILE_PATH} -> availability.noticePeriod or availability.startDate`,
                ],
              }),
        };
      }
    /* c8 ignore stop */
    case "employment_references":
      {
        const references = profile.references ?? [];
        const answer = references.length > 0
          ? references
              .map((reference) =>
                reference.relationship
                  ? `${reference.name} (${reference.linkedinUrl}) - ${reference.relationship}`
                  : `${reference.name} (${reference.linkedinUrl})`,
              )
              .join(", ")
          : null;

        return {
          questionType: question.type,
          strategy: answer ? "deterministic" : "needs-review",
          answer,
          confidence: answer ? 0.95 : 0.2,
          confidenceLabel: labelConfidence(answer ? 0.95 : 0.2, !answer),
          source: answer ? "candidate-profile" : "manual",
          ...(answer ? {} : { notes: ["Missing private employment references."] }),
        };
      }
    case "gpa":
      return {
        questionType: question.type,
        strategy: "deterministic",
        answer: profile.gpa == null ? null : String(profile.gpa),
        confidence: profile.gpa == null ? 0.3 : 0.95,
        confidenceLabel: labelConfidence(profile.gpa == null ? 0.3 : 0.95, profile.gpa == null),
        source: profile.gpa == null ? "manual" : "candidate-profile",
      };
    default:
      return null;
  }
}
