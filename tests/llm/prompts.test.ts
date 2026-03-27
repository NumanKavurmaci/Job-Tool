import { describe, expect, it } from "vitest";
import { buildParseJobPrompt } from "../../src/llm/prompts.js";

describe("buildParseJobPrompt", () => {
  it("includes the JSON-only rules and schema guidance", () => {
    const prompt = buildParseJobPrompt("Title: Backend Engineer");

    expect(prompt).toContain("Return only valid JSON");
    expect(prompt).toContain("Do not wrap the response in markdown");
    expect(prompt).toContain('"mustHaveSkills": string[]');
    expect(prompt).toContain('"workAuthorization": "authorized"');
  });

  it("embeds the formatted job text", () => {
    const prompt = buildParseJobPrompt("Title: Backend Engineer\nCompany: Acme");

    expect(prompt).toContain('"""Title: Backend Engineer\nCompany: Acme"""');
  });
});
