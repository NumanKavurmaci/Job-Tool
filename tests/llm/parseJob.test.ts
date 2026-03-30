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

    await expect(parseJob("Title: Backend Engineer")).rejects.toMatchObject({
      name: "AppError",
      phase: "llm",
      code: "LLM_INVALID_JSON",
      message: expect.stringContaining("returned invalid JSON"),
    });
    expect(errorMock).toHaveBeenCalled();
  });

  it("accepts fenced JSON from local providers", async () => {
    parseJobMock.mockResolvedValue({
      text: `\`\`\`json
{
  "title": "Backend Engineer",
  "company": "Acme",
  "location": "Remote",
  "platform": "generic",
  "seniority": "Mid",
  "mustHaveSkills": ["TypeScript"],
  "niceToHaveSkills": [],
  "technologies": ["TypeScript"],
  "yearsRequired": 3,
  "remoteType": "Remote",
  "visaSponsorship": "yes",
  "workAuthorization": "authorized"
}
\`\`\``,
      provider: "local",
      model: "openai/gpt-oss-20b",
    });

    const { parseJob } = await import("../../src/llm/parseJob.js");
    const result = await parseJob("Title: Backend Engineer");

    expect(result.parsed.company).toBe("Acme");
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

    await expect(parseJob("Title: Backend Engineer")).rejects.toMatchObject({
      name: "AppError",
      phase: "llm",
      code: "LLM_SCHEMA_VALIDATION_FAILED",
      message: expect.stringContaining("failed schema validation"),
    });
    expect(errorMock).toHaveBeenCalled();
  });

  it("throws on empty provider responses", async () => {
    parseJobMock.mockResolvedValue({
      text: "   ",
      provider: "local",
      model: "openai/gpt-oss-20b",
    });

    const { parseJob } = await import("../../src/llm/parseJob.js");

    await expect(parseJob("Title: Backend Engineer")).rejects.toMatchObject({
      name: "AppError",
      phase: "llm",
      code: "LLM_EMPTY_RESPONSE",
      message: expect.stringContaining("empty response"),
    });
    expect(errorMock).toHaveBeenCalled();
  });

  it("drops parsed location when the caller locks location externally", async () => {
    parseJobMock.mockResolvedValue({
      text: JSON.stringify({
        title: "Backend Engineer",
        company: "Acme",
        location: "Europe",
        platform: "generic",
        seniority: "Mid",
        mustHaveSkills: ["TypeScript"],
        niceToHaveSkills: [],
        technologies: ["TypeScript"],
        yearsRequired: 3,
        remoteType: "Hybrid",
        visaSponsorship: "yes",
        workAuthorization: "authorized",
      }),
      provider: "local",
      model: "openai/gpt-oss-20b",
    });

    const { parseJob } = await import("../../src/llm/parseJob.js");
    const result = await parseJob("Title: Backend Engineer", {
      excludeLocation: true,
    });

    expect(result.parsed.location).toBeNull();
    expect(parseJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('"location": null'),
      }),
    );
  });

  it("keeps provider-returned location when location is not locked", async () => {
    parseJobMock.mockResolvedValue({
      text: JSON.stringify({
        title: "Backend Engineer",
        company: "Acme",
        location: "Berlin, Germany",
        platform: "generic",
        seniority: "Mid",
        mustHaveSkills: ["TypeScript"],
        niceToHaveSkills: [],
        technologies: ["TypeScript"],
        yearsRequired: 3,
        remoteType: "Hybrid",
        visaSponsorship: "yes",
        workAuthorization: "authorized",
      }),
      provider: "local",
      model: "openai/gpt-oss-20b",
    });

    const { parseJob } = await import("../../src/llm/parseJob.js");
    const result = await parseJob("Title: Backend Engineer");

    expect(result.parsed.location).toBe("Berlin, Germany");
    expect(parseJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('"location": string | null'),
      }),
    );
  });

  it("preserves non-location fields when excludeLocation is enabled", async () => {
    parseJobMock.mockResolvedValue({
      text: JSON.stringify({
        title: "Backend Engineer",
        company: "Acme",
        location: "Europe",
        platform: "linkedin",
        seniority: "Senior",
        mustHaveSkills: ["TypeScript", "Node.js"],
        niceToHaveSkills: ["Kafka"],
        technologies: ["TypeScript", "Node.js", "Kafka"],
        yearsRequired: 5,
        remoteType: "Hybrid",
        visaSponsorship: "no",
        workAuthorization: "authorized",
      }),
      provider: "local",
      model: "openai/gpt-oss-20b",
    });

    const { parseJob } = await import("../../src/llm/parseJob.js");
    const result = await parseJob("Title: Backend Engineer", {
      excludeLocation: true,
    });

    expect(result.parsed).toMatchObject({
      title: "Backend Engineer",
      company: "Acme",
      platform: "linkedin",
      seniority: "Senior",
      remoteType: "Hybrid",
      visaSponsorship: "no",
      workAuthorization: "authorized",
    });
    expect(result.parsed.mustHaveSkills).toEqual(["TypeScript", "Node.js"]);
    expect(result.parsed.location).toBeNull();
  });

  it("logs successful parses even when location is excluded", async () => {
    parseJobMock.mockResolvedValue({
      text: JSON.stringify({
        title: "Backend Engineer",
        company: "Acme",
        location: "Europe",
        platform: "linkedin",
        seniority: "Senior",
        mustHaveSkills: [],
        niceToHaveSkills: [],
        technologies: [],
        yearsRequired: null,
        remoteType: "Hybrid",
        visaSponsorship: null,
        workAuthorization: "unknown",
      }),
      provider: "local",
      model: "openai/gpt-oss-20b",
    });

    const { parseJob } = await import("../../src/llm/parseJob.js");
    await parseJob("Title: Backend Engineer", {
      excludeLocation: true,
    });

    expect(infoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "llm.parse.succeeded",
        provider: "local",
        model: "openai/gpt-oss-20b",
      }),
      "LLM parse succeeded",
    );
  });
});
