import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAnswerCacheKey,
  persistResolvedAnswer,
  readAnswerCache,
  readCachedResolvedAnswer,
} from "../../src/answers/cache.js";

function createStore() {
  return {
    answerCacheEntry: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
  };
}

describe("answer cache", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the normalized question as the cache key", () => {
    expect(
      getAnswerCacheKey({
        type: "linkedin",
        normalizedText: "linkedin profile",
        confidence: 0.9,
      }),
    ).toBe("linkedin profile");
  });

  it("returns an empty cache when the database read fails", async () => {
    const store = createStore();
    store.answerCacheEntry.findMany.mockRejectedValue(new Error("sqlite busy"));

    await expect(readAnswerCache(store as never)).resolves.toEqual({ answers: {} });
  });

  it("returns a cached answer by normalized question", async () => {
    const store = createStore();
    store.answerCacheEntry.findUnique.mockResolvedValue({
      normalizedQuestion: "linkedin profile",
      label: "LinkedIn Profile",
      questionType: "linkedin",
      strategy: "deterministic",
      answerJson: JSON.stringify("https://linkedin.com/in/example"),
      confidenceLabel: "high",
      source: "candidate-profile",
      notesJson: JSON.stringify(["cached"]),
      updatedAt: new Date("2026-03-29T12:00:00.000Z"),
    });

    const result = await readCachedResolvedAnswer(
      {
        type: "linkedin",
        normalizedText: "linkedin profile",
        confidence: 0.9,
      },
      store as never,
    );

    expect(result).toEqual({
      normalizedQuestion: "linkedin profile",
      label: "LinkedIn Profile",
      questionType: "linkedin",
      strategy: "deterministic",
      answer: "https://linkedin.com/in/example",
      confidenceLabel: "high",
      source: "candidate-profile",
      notes: ["cached"],
      updatedAt: "2026-03-29T12:00:00.000Z",
    });
  });

  it("returns null when a cached answer does not exist", async () => {
    const store = createStore();
    store.answerCacheEntry.findUnique.mockResolvedValue(null);

    await expect(
      readCachedResolvedAnswer(
        {
          type: "linkedin",
          normalizedText: "linkedin profile",
          confidence: 0.9,
        },
        store as never,
      ),
    ).resolves.toBeNull();
  });

  it("persists resolved answers via database upsert", async () => {
    const store = createStore();

    await persistResolvedAnswer({
      store: store as never,
      question: { label: "LinkedIn Profile", inputType: "text" },
      classified: {
        type: "linkedin",
        normalizedText: "linkedin profile",
        confidence: 0.9,
      },
      resolved: {
        questionType: "linkedin",
        strategy: "deterministic",
        answer: "https://linkedin.com/in/example",
        confidence: 1,
        confidenceLabel: "high",
        source: "candidate-profile",
        notes: ["from profile"],
      },
    });

    expect(store.answerCacheEntry.upsert).toHaveBeenCalledWith({
      where: { normalizedQuestion: "linkedin profile" },
      update: expect.objectContaining({
        label: "LinkedIn Profile",
        questionType: "linkedin",
        strategy: "deterministic",
        answerJson: JSON.stringify("https://linkedin.com/in/example"),
        confidenceLabel: "high",
        source: "candidate-profile",
        notesJson: JSON.stringify(["from profile"]),
      }),
      create: expect.objectContaining({
        normalizedQuestion: "linkedin profile",
        label: "LinkedIn Profile",
      }),
    });
  });

  it("returns database-backed cache entries in the legacy map shape", async () => {
    const store = createStore();
    store.answerCacheEntry.findMany.mockResolvedValue([
      {
        normalizedQuestion: "linkedin profile",
        label: "LinkedIn Profile",
        questionType: "linkedin",
        strategy: "deterministic",
        answerJson: JSON.stringify("https://linkedin.com/in/example"),
        confidenceLabel: "high",
        source: "candidate-profile",
        notesJson: null,
        updatedAt: new Date("2026-03-29T12:00:00.000Z"),
      },
    ]);

    const result = await readAnswerCache(store as never);
    expect(result.answers["linkedin profile"]?.answer).toBe(
      "https://linkedin.com/in/example",
    );
  });
});
