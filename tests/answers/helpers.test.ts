import { describe, expect, it } from "vitest";
import { buildAnswerBank } from "../../src/answers/answerBank.js";
import { labelConfidence } from "../../src/answers/confidence.js";

describe("answer helpers", () => {
  it("labels low confidence answers correctly", () => {
    expect(labelConfidence(0.2)).toBe("low");
  });

  it("marks sponsorship as manual review when missing", () => {
    const bank = buildAnswerBank({
      fullName: "Jane Doe",
      email: null,
      phone: null,
      location: null,
      linkedinUrl: null,
      githubUrl: null,
      portfolioUrl: null,
      summary: null,
      yearsOfExperienceTotal: null,
      currentTitle: null,
      preferredRoles: [],
      preferredTechStack: [],
      skills: [],
      languages: [],
      workAuthorization: null,
      requiresSponsorship: null,
      willingToRelocate: null,
      remotePreference: null,
      education: [],
      experience: [],
      projects: [],
      resumeText: "",
      sourceMetadata: {},
    });

    expect(bank.sponsorship.confidenceLabel).toBe("manual_review");
  });
});
