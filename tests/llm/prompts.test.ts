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

  it("tells the model not to return location when adapter metadata already locked it", () => {
    const prompt = buildParseJobPrompt("Title: Backend Engineer\nCompany: Acme", {
      excludeLocation: true,
    });

    expect(prompt).toContain('set "location" to null');
    expect(prompt).toContain('"location": null');
  });

  it("keeps the normal location schema when location is not locked", () => {
    const prompt = buildParseJobPrompt("Title: Backend Engineer\nLocation: Berlin");

    expect(prompt).toContain('"location": string | null');
    expect(prompt).not.toContain('"location": null');
  });

  it("falls back to the weaker-guess guidance when location can still be inferred", () => {
    const prompt = buildParseJobPrompt("Title: Backend Engineer\nLocation: Berlin");

    expect(prompt).toContain("Prefer explicitly labeled fields over weak guesses");
    expect(prompt).not.toContain("Do not infer or return location");
  });

  it("still preserves the rest of the schema when location is excluded", () => {
    const prompt = buildParseJobPrompt("Title: Backend Engineer", {
      excludeLocation: true,
    });

    expect(prompt).toContain('"title": string | null');
    expect(prompt).toContain('"company": string | null');
    expect(prompt).toContain('"remoteType": string | null');
    expect(prompt).toContain('"visaSponsorship": "yes" | "no" | null');
  });

  it("truncates very long job text to the prompt safety limit", () => {
    const longText = `Title: Backend Engineer\n${"A".repeat(13000)}`;

    const prompt = buildParseJobPrompt(longText);

    expect(prompt).toContain("Job posting text:");
    expect(prompt).not.toContain("A".repeat(12550));
  });
});
