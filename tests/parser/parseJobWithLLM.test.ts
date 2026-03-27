import { beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();

vi.mock("../../src/llm/client.js", () => ({
  openai: {
    responses: {
      create: createMock,
    },
  },
}));

describe("parseJobWithLLM", () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it("sends a prompt to OpenAI and parses the JSON response", async () => {
    createMock.mockResolvedValue({
      output_text: JSON.stringify({
        title: "Backend Engineer",
        company: "Acme",
        location: "Remote",
        platform: "greenhouse",
        seniority: "Senior",
        mustHaveSkills: ["TypeScript"],
        niceToHaveSkills: ["Prisma"],
        remoteType: "Remote",
      }),
    });

    const { parseJobWithLLM } = await import("../../src/parser/parseJobWithLLM.js");
    const result = await parseJobWithLLM("Title: Backend Engineer");

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0]?.[0]).toMatchObject({
      model: "gpt-4.1-mini",
    });
    expect(result.mustHaveSkills).toEqual(["TypeScript"]);
    expect(result.niceToHaveSkills).toEqual(["Prisma"]);
  });

  it("fails on invalid JSON schema", async () => {
    createMock.mockResolvedValue({
      output_text: JSON.stringify({
        title: "Backend Engineer",
        mustHaveSkills: "TypeScript",
      }),
    });

    const { parseJobWithLLM } = await import("../../src/parser/parseJobWithLLM.js");

    await expect(parseJobWithLLM("Title: Backend Engineer")).rejects.toThrow();
  });
});
