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
});
