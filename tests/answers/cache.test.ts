import { describe, expect, it, vi } from "vitest";
import { isDynamicAnswerQuestionType, persistResolvedAnswer } from "../../src/answers/cache.js";

describe("answer cache", () => {
  it("marks page-specific question types as dynamic", () => {
    expect(isDynamicAnswerQuestionType("cover_letter")).toBe(true);
    expect(isDynamicAnswerQuestionType("motivation_short_text")).toBe(true);
    expect(isDynamicAnswerQuestionType("general_short_text")).toBe(true);
    expect(isDynamicAnswerQuestionType("unknown")).toBe(true);
    expect(isDynamicAnswerQuestionType("contact_info")).toBe(false);
  });

  it("does not persist null or low-confidence answers", async () => {
    const upsert = vi.fn();

    await persistResolvedAnswer({
      question: { label: "First Name", inputType: "short_text" },
      classified: {
        type: "contact_info",
        normalizedText: "first name first name",
        confidence: 0.92,
      },
      resolved: {
        questionType: "contact_info",
        strategy: "generated",
        answer: null,
        confidence: 0.3,
        confidenceLabel: "low",
        source: "llm",
      },
      store: {
        answerCacheEntry: {
          findUnique: vi.fn(),
          findMany: vi.fn(),
          upsert,
        },
      },
    });

    expect(upsert).not.toHaveBeenCalled();
  });

  it("does not persist dynamic generated answers such as cover letters", async () => {
    const upsert = vi.fn();

    await persistResolvedAnswer({
      question: { label: "Cover Letter", inputType: "textarea" },
      classified: {
        type: "cover_letter",
        normalizedText: "cover letter",
        confidence: 0.98,
      },
      resolved: {
        questionType: "cover_letter",
        strategy: "generated",
        answer: "Custom letter",
        confidence: 0.68,
        confidenceLabel: "medium",
        source: "llm",
      },
      store: {
        answerCacheEntry: {
          findUnique: vi.fn(),
          findMany: vi.fn(),
          upsert,
        },
      },
    });

    expect(upsert).not.toHaveBeenCalled();
  });

  it("persists stable non-null deterministic answers", async () => {
    const upsert = vi.fn();

    await persistResolvedAnswer({
      question: { label: "First Name", inputType: "short_text" },
      classified: {
        type: "contact_info",
        normalizedText: "first name first name",
        confidence: 0.92,
      },
      resolved: {
        questionType: "contact_info",
        strategy: "deterministic",
        answer: "Jane",
        confidence: 0.95,
        confidenceLabel: "high",
        source: "candidate-profile",
      },
      store: {
        answerCacheEntry: {
          findUnique: vi.fn(),
          findMany: vi.fn(),
          upsert,
        },
      },
    });

    expect(upsert).toHaveBeenCalledOnce();
  });
});
