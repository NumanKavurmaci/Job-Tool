import { beforeEach, describe, expect, it, vi } from "vitest";

const parseJobMock = vi.fn();
const infoMock = vi.fn();
const errorMock = vi.fn();

vi.mock("../../src/llm/providers/resolveProvider.js", () => ({
  resolveProvider: () => ({
    name: "local",
    parseJob: parseJobMock,
  }),
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    info: infoMock,
    error: errorMock,
  },
}));

describe("parseJob orchestration", () => {
  beforeEach(() => {
    vi.resetModules();
    parseJobMock.mockReset();
    infoMock.mockReset();
    errorMock.mockReset();
  });

  it("parses valid JSON and returns provider metadata", async () => {
    parseJobMock.mockResolvedValue({
      text: JSON.stringify({
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
      }),
      provider: "local",
      model: "openai/gpt-oss-20b",
    });

    const { parseJob } = await import("../../src/llm/parseJob.js");
    const result = await parseJob("Title: Backend Engineer");

    expect(result.provider).toBe("local");
    expect(result.model).toBe("openai/gpt-oss-20b");
    expect(result.parsed.title).toBe("Backend Engineer");
    expect(infoMock).toHaveBeenCalled();
  });

  it("throws on invalid JSON", async () => {
    parseJobMock.mockResolvedValue({
      text: "not-json",
      provider: "local",
      model: "openai/gpt-oss-20b",
    });

    const { parseJob } = await import("../../src/llm/parseJob.js");

    await expect(parseJob("Title: Backend Engineer")).rejects.toThrow(
      "returned invalid JSON",
    );
    expect(errorMock).toHaveBeenCalled();
  });

  it("throws on schema validation errors", async () => {
    parseJobMock.mockResolvedValue({
      text: JSON.stringify({
        title: "Backend Engineer",
        mustHaveSkills: "TypeScript",
      }),
      provider: "local",
      model: "openai/gpt-oss-20b",
    });

    const { parseJob } = await import("../../src/llm/parseJob.js");

    await expect(parseJob("Title: Backend Engineer")).rejects.toThrow(
      "failed schema validation",
    );
    expect(errorMock).toHaveBeenCalled();
  });
});
