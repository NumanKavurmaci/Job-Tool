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
    expect(result.experienceOverrides).toEqual({});
    expect(result.salaryExpectations).toEqual({ usd: null, eur: null, try: null });
    expect(result.salaryExpectation).toBeNull();
    expect(result.gpa).toBeNull();
    expect(result.preferredRoles).toContain("Backend Engineer");
    expect(result.preferredTechStack).toEqual(["TypeScript", "Node.js"]);
    expect(result.remoteOnly).toBe(false);
    expect(result.disability.disclosurePreference).toBe("manual-review");
  });

  it("repairs contact details from raw resume text when parsing leaves broken values", () => {
    const result = normalizeResume(
      {
        fullName: "Numan Kavurmacı",
        email: "numan.kavurmaci.samsun@gmai l.com",
        phone: null,
        location: "Samsun,\n Türkiye",
        githubUrl: null,
        portfolioUrl: null,
        summary: null,
        currentTitle: "Software Engineer",
        skills: [],
        languages: [],
        workAuthorization: null,
        requiresSponsorship: null,
        willingToRelocate: null,
        remotePreference: null,
        education: [],
        experience: [],
        projects: [],
        yearsOfExperienceTotal: 3,
      },
      [
        "Contact",
        "+905416467889 (Mobile)",
        "numan.kavurmaci.samsun@gmai",
        "l.com",
        "www.linkedin.com/in/numan-kavurmacı-227a35247 (LinkedIn)",
      ].join("\n"),
      {
        resumePath: "./resume.pdf",
      },
    );

    expect(result.email).toBe("numan.kavurmaci.samsun@gmail.com");
    expect(result.phone).toBe("+905416467889");
    expect(result.location).toBe("Samsun, Türkiye");
    expect(result.linkedinUrl).toBe("https://www.linkedin.com/in/numan-kavurmacı-227a35247");
  });
});
