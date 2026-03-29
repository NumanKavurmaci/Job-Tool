import { beforeEach, describe, expect, it, vi } from "vitest";

const completePromptMock = vi.fn();

vi.mock("../../src/llm/completePrompt.js", () => ({
  completePrompt: completePromptMock,
}));

describe("parseResume", () => {
  beforeEach(() => {
    vi.resetModules();
    completePromptMock.mockReset();
  });

  it("parses valid structured resume JSON", async () => {
    completePromptMock.mockResolvedValue({
      text: JSON.stringify({
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
        experience: [],
        projects: [],
        yearsOfExperienceTotal: 4,
      }),
    });

    const { parseResume } = await import("../../src/candidate/resume/parseResume.js");
    const result = await parseResume("Jane Doe resume");

    expect(result.fullName).toBe("Jane Doe");
    expect(result.skills).toEqual(["TypeScript", "Node.js"]);
  });

  it("fails on invalid JSON", async () => {
    completePromptMock.mockResolvedValue({ text: "not-json" });
    const { parseResume } = await import("../../src/candidate/resume/parseResume.js");
    await expect(parseResume("resume")).rejects.toThrow("Resume parser returned invalid JSON.");
  });

  it("accepts fenced JSON from local models", async () => {
    completePromptMock.mockResolvedValue({
      text: `\`\`\`json
{
  "fullName": "Jane Doe",
  "email": "jane@example.com",
  "phone": null,
  "location": "Berlin",
  "githubUrl": null,
  "portfolioUrl": null,
  "summary": null,
  "currentTitle": "Backend Engineer",
  "skills": ["TypeScript"],
  "languages": ["English"],
  "workAuthorization": null,
  "requiresSponsorship": false,
  "willingToRelocate": false,
  "remotePreference": "remote",
  "education": [],
  "experience": [],
  "projects": [],
  "yearsOfExperienceTotal": 4
}
\`\`\``,
    });

    const { parseResume } = await import("../../src/candidate/resume/parseResume.js");
    const result = await parseResume("Jane Doe resume");

    expect(result.fullName).toBe("Jane Doe");
    expect(result.currentTitle).toBe("Backend Engineer");
  });

  it("normalizes null array fields from local models", async () => {
    completePromptMock.mockResolvedValue({
      text: JSON.stringify({
        fullName: "Jane Doe",
        email: "jane@example.com",
        phone: null,
        location: "Berlin",
        githubUrl: null,
        portfolioUrl: null,
        summary: null,
        currentTitle: "Backend Engineer",
        skills: null,
        languages: null,
        workAuthorization: null,
        requiresSponsorship: false,
        willingToRelocate: false,
        remotePreference: "remote",
        education: null,
        experience: [
          {
            company: "Acme",
            title: "Engineer",
            summary: null,
            technologies: null,
            startDate: null,
            endDate: null,
          },
        ],
        projects: null,
        yearsOfExperienceTotal: 4,
      }),
    });

    const { parseResume } = await import("../../src/candidate/resume/parseResume.js");
    const result = await parseResume("Jane Doe resume");

    expect(result.skills).toEqual([]);
    expect(result.languages).toEqual([]);
    expect(result.education).toEqual([]);
    expect(result.projects).toEqual([]);
    expect(result.experience[0]?.technologies).toEqual([]);
  });

  it("tolerates null nested required strings from live models", async () => {
    completePromptMock.mockResolvedValue({
      text: JSON.stringify({
        fullName: "Jane Doe",
        email: "jane@example.com",
        phone: null,
        location: "Berlin",
        githubUrl: null,
        portfolioUrl: null,
        summary: null,
        currentTitle: "Backend Engineer",
        skills: ["TypeScript"],
        languages: ["English"],
        workAuthorization: null,
        requiresSponsorship: false,
        willingToRelocate: false,
        remotePreference: "remote",
        education: [
          {
            institution: null,
            degree: "BSc",
            fieldOfStudy: null,
            startDate: null,
            endDate: null,
          },
        ],
        experience: [
          {
            company: null,
            title: null,
            summary: null,
            technologies: ["TypeScript"],
            startDate: null,
            endDate: null,
          },
        ],
        projects: [
          {
            name: null,
            summary: null,
            technologies: null,
          },
        ],
        yearsOfExperienceTotal: 4,
      }),
    });

    const { parseResume } = await import("../../src/candidate/resume/parseResume.js");
    const result = await parseResume("Jane Doe resume");

    expect(result.education[0]?.institution).toBe("");
    expect(result.experience[0]?.company).toBe("");
    expect(result.experience[0]?.title).toBe("");
    expect(result.projects[0]?.name).toBe("");
    expect(result.projects[0]?.technologies).toEqual([]);
  });
});
