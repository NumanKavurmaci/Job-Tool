import { beforeEach, describe, expect, it, vi } from "vitest";

const parseJobMock = vi.fn();

vi.mock("../../src/llm/parseJob.js", () => ({
  parseJob: parseJobMock,
}));

describe("parseJobWithLLM", () => {
  beforeEach(() => {
    vi.resetModules();
    parseJobMock.mockReset();
  });

  it("acts as a compatibility wrapper over the shared parseJob orchestration", async () => {
    parseJobMock.mockResolvedValue({
      parsed: {
        title: "Backend Engineer",
        company: "Acme",
        location: "Remote",
        platform: "generic",
        seniority: "Mid",
        mustHaveSkills: ["TypeScript"],
        niceToHaveSkills: [],
        technologies: ["TypeScript"],
        yearsRequired: 3,
        remoteType: "Remote",
        visaSponsorship: "yes",
        workAuthorization: "authorized",
      },
      provider: "openai",
      model: "gpt-4.1-mini",
      rawText: '{"title":"Backend Engineer"}',
    });

    const { parseJobWithLLM } = await import("../../src/parser/parseJobWithLLM.js");
    const result = await parseJobWithLLM("Formatted job text");

    expect(parseJobMock).toHaveBeenCalledWith("Formatted job text", undefined);
    expect(result.title).toBe("Backend Engineer");
  });
});
