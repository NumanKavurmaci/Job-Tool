import { describe, expect, it, vi } from "vitest";
import {
  getAnswerCacheKey,
  isDynamicAnswerQuestionType,
  persistResolvedAnswer,
  readAnswerCache,
  readCachedResolvedAnswer,
} from "../../src/answers/cache.js";
import { logger } from "../../src/utils/logger.js";

describe("answer cache", () => {
  it("marks page-specific question types as dynamic", () => {
    expect(isDynamicAnswerQuestionType("cover_letter")).toBe(true);
    expect(isDynamicAnswerQuestionType("motivation_short_text")).toBe(true);
    expect(isDynamicAnswerQuestionType("general_short_text")).toBe(true);
    expect(isDynamicAnswerQuestionType("unknown")).toBe(true);
    expect(isDynamicAnswerQuestionType("contact_info")).toBe(false);
  });

  it("uses normalized question text as the cache key", () => {
    expect(
      getAnswerCacheKey({
        type: "contact_info",
        normalizedText: "first name",
        confidence: 0.91,
      }),
    ).toBe("first name");
  });

  it("reads and deserializes the answer cache", async () => {
    const result = await readAnswerCache({
      answerCacheEntry: {
        findMany: vi.fn().mockResolvedValue([
          {
            normalizedQuestion: "first name",
            label: "First Name",
            questionType: "contact_info",
            strategy: "deterministic",
            answerJson: JSON.stringify("Numan"),
            confidenceLabel: "high",
            source: "candidate-profile",
            notesJson: JSON.stringify(["Stable"]),
            updatedAt: new Date("2026-03-29T10:00:00.000Z"),
          },
        ]),
        findUnique: vi.fn(),
        upsert: vi.fn(),
      },
    });

    expect(result.answers["first name"]).toEqual({
      normalizedQuestion: "first name",
      label: "First Name",
      questionType: "contact_info",
      strategy: "deterministic",
      answer: "Numan",
      confidenceLabel: "high",
      source: "candidate-profile",
      notes: ["Stable"],
      updatedAt: "2026-03-29T10:00:00.000Z",
    });
  });

  it("returns an empty cache when reading fails", async () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);

    const result = await readAnswerCache({
      answerCacheEntry: {
        findMany: vi.fn().mockRejectedValue(new Error("db down")),
        findUnique: vi.fn(),
        upsert: vi.fn(),
      },
    });

    expect(result).toEqual({ answers: {} });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("reads a cached resolved answer by normalized question", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      normalizedQuestion: "email",
      label: "Email",
      questionType: "contact_info",
      strategy: "deterministic",
      answerJson: JSON.stringify("numan@example.com"),
      confidenceLabel: "high",
      source: "candidate-profile",
      notesJson: null,
      updatedAt: new Date("2026-03-29T11:00:00.000Z"),
    });

    const result = await readCachedResolvedAnswer(
      {
        type: "contact_info",
        normalizedText: "email",
        confidence: 0.94,
      },
      {
        answerCacheEntry: {
          findMany: vi.fn(),
          findUnique,
          upsert: vi.fn(),
        },
      },
    );

    expect(findUnique).toHaveBeenCalledWith({
      where: { normalizedQuestion: "email" },
    });
    expect(result?.answer).toBe("numan@example.com");
    expect(result?.updatedAt).toBe("2026-03-29T11:00:00.000Z");
  });

  it("returns null when cached lookup fails", async () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);

    const result = await readCachedResolvedAnswer(
      {
        type: "contact_info",
        normalizedText: "phone",
        confidence: 0.94,
      },
      {
        answerCacheEntry: {
          findMany: vi.fn(),
          findUnique: vi.fn().mockRejectedValue(new Error("lookup failed")),
          upsert: vi.fn(),
        },
      },
    );

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
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

  it("does not persist manual-review answers", async () => {
    const upsert = vi.fn();

    await persistResolvedAnswer({
      question: { label: "Work Authorization", inputType: "short_text" },
      classified: {
        type: "work_authorization",
        normalizedText: "authorized to work",
        confidence: 0.92,
      },
      resolved: {
        questionType: "work_authorization",
        strategy: "needs-review",
        answer: "Review with candidate",
        confidence: 0.2,
        confidenceLabel: "manual_review",
        source: "manual",
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

  it("swallows persistence failures and warns instead", async () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);

    await expect(
      persistResolvedAnswer({
        question: { label: "First Name", inputType: "short_text" },
        classified: {
          type: "contact_info",
          normalizedText: "first name",
          confidence: 0.92,
        },
        resolved: {
          questionType: "contact_info",
          strategy: "deterministic",
          answer: "Numan",
          confidence: 0.95,
          confidenceLabel: "high",
          source: "candidate-profile",
        },
        store: {
          answerCacheEntry: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            upsert: vi.fn().mockRejectedValue(new Error("write failed")),
          },
        },
      }),
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
