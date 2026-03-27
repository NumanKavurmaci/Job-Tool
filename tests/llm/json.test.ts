import { describe, expect, it } from "vitest";
import { extractJsonText, parseJsonResponse } from "../../src/llm/json.js";

describe("llm json helpers", () => {
  it("extracts fenced json blocks", () => {
    expect(extractJsonText("```json\n{\"ok\":true}\n```")).toBe("{\"ok\":true}");
  });

  it("extracts embedded object json from noisy model output", () => {
    expect(extractJsonText("<|channel|>assistant\n{\"answer\":\"0\"}\n<|end|>")).toBe(
      "{\"answer\":\"0\"}",
    );
  });

  it("parses extracted embedded json", () => {
    expect(parseJsonResponse("prefix\n{\"answer\":false}\nsuffix")).toEqual({
      answer: false,
    });
  });
});
