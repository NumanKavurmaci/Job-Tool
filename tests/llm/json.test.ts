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

  it("does not let braces inside strings terminate the object", () => {
    expect(
      extractJsonText('prefix {"message":"use } and { literally","ok":true} suffix'),
    ).toBe('{"message":"use } and { literally","ok":true}');
  });

  it("extracts only the first balanced value from multiple objects", () => {
    expect(extractJsonText('before {"first":1} between {"second":2} after')).toBe(
      '{"first":1}',
    );
  });

  it("supports nested arrays and escaped quotes", () => {
    expect(parseJsonResponse('noise [{"value":"\\\"quoted\\\""},[1,2]] tail')).toEqual([
      { value: '"quoted"' },
      [1, 2],
    ]);
  });
});
