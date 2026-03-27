import { describe, expect, it } from "vitest";
import { normalizeResume } from "../../src/candidate/resume/normalizeResume.js";

describe("normalizeResume", () => {
  it("builds a candidate master profile from parsed resume data", () => {
    const result = normalizeResume(
      {
        fullName: "Jane Doe",
        email: "jane@example.com",
        phone: null,
        location: "Berlin",
        githubUrl: "https://github.com/jane",
        portfolioUrl: null,
        summary: "Backend engineer",
        currentTitle: "Backend Engineer",
        skills: ["TypeScript", "Node.js"],
        languages: ["English"],
        workAuthorization: "EU",
        requiresSponsorship: false,
        willingToRelocate: true,
        remotePreference: "remote",
        education: [],
        experience: [
          {
            company: "Acme",
            title: "Backend Engineer",
            summary: "Built APIs",
            technologies: ["TypeScript", "Node.js"],
            startDate: null,
            endDate: null,
          },
        ],
        projects: [],
        yearsOfExperienceTotal: 4,
      },
      "resume text",
      {
        resumePath: "./resume.txt",
        linkedinUrl: "https://linkedin.com/in/jane",
      },
    );

    expect(result.linkedinUrl).toBe("https://linkedin.com/in/jane");
    expect(result.preferredRoles).toContain("Backend Engineer");
    expect(result.preferredTechStack).toEqual(["TypeScript", "Node.js"]);
  });
});
