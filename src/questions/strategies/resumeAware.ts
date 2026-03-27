import type { CandidateProfile } from "../../candidate/types.js";
import type { ResolvedAnswer } from "../../answers/types.js";
import { labelConfidence } from "../../answers/confidence.js";
import type { ClassifiedQuestion } from "../types.js";

function estimateYearsForSkill(profile: CandidateProfile, text: string): number | null {
  const lower = text.toLowerCase();
  const override = Object.entries(profile.experienceOverrides).find(([keyword]) =>
    lower.includes(keyword.toLowerCase()),
  );
  if (override) {
    return override[1];
  }

  if (/\b(full[\s-]?stack|front[\s-]?end|backend|software development|software engineering)\b/.test(lower)) {
    return profile.yearsOfExperienceTotal;
  }

  const matchedSkill = profile.skills.find((skill) => lower.includes(skill.toLowerCase()))
    ?? profile.preferredTechStack.find((skill) => lower.includes(skill.toLowerCase()));

  if (!matchedSkill) {
    return 0;
  }

  const matchingExperiences = profile.experience.filter((item) =>
    item.technologies.some((technology) =>
      technology.toLowerCase().includes(matchedSkill.toLowerCase()),
    ) ||
    `${item.title} ${item.summary ?? ""}`.toLowerCase().includes(matchedSkill.toLowerCase()),
  );

  if (matchingExperiences.length === 0) {
    return 0;
  }

  return profile.yearsOfExperienceTotal ?? matchingExperiences.length;
}

export function resolveResumeAwareAnswer(
  question: ClassifiedQuestion,
  profile: CandidateProfile,
): ResolvedAnswer | null {
  if (question.type === "years_of_experience") {
    const years = estimateYearsForSkill(profile, question.normalizedText);
    const hasConfidentYears = years != null;

    return {
      questionType: question.type,
      strategy: "resume-derived",
      answer: hasConfidentYears ? String(years) : null,
      confidence: hasConfidentYears ? (years === 0 ? 0.72 : 0.75) : 0.45,
      confidenceLabel: labelConfidence(
        hasConfidentYears ? (years === 0 ? 0.72 : 0.75) : 0.45,
        !hasConfidentYears,
      ),
      source: hasConfidentYears ? "resume" : "manual",
      ...(!hasConfidentYears
        ? { notes: ["Could not determine years confidently from resume."] }
        : {}),
    };
  }

  if (question.type === "skill_experience") {
    const relevant = profile.preferredTechStack.filter((skill) =>
      question.normalizedText.includes(skill.toLowerCase()),
    );

    return {
      questionType: question.type,
      strategy: "resume-derived",
      answer: relevant.length > 0 ? relevant.join(", ") : profile.skills.slice(0, 5).join(", "),
      confidence: relevant.length > 0 ? 0.8 : 0.65,
      confidenceLabel: labelConfidence(relevant.length > 0 ? 0.8 : 0.65),
      source: "resume",
    };
  }

  if (question.type === "education") {
    return {
      questionType: question.type,
      strategy: "resume-derived",
      answer: profile.education[0]
        ? `${profile.education[0].degree ?? "Degree"}${profile.education[0].fieldOfStudy ? ` in ${profile.education[0].fieldOfStudy}` : ""} at ${profile.education[0].institution}`
        : null,
      confidence: profile.education[0] ? 0.82 : 0.4,
      confidenceLabel: labelConfidence(profile.education[0] ? 0.82 : 0.4, !profile.education[0]),
      source: profile.education[0] ? "resume" : "manual",
    };
  }

  return null;
}
