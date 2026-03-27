import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getAnswerCachePath,
  getAnswerCacheKey,
  persistResolvedAnswer,
  readAnswerCache,
} from "../../src/answers/cache.js";

const originalPath = process.env.ANSWER_CACHE_PATH;
const originalCwd = process.cwd();

describe("answer cache", () => {
  afterEach(() => {
    if (originalPath == null) {
      delete process.env.ANSWER_CACHE_PATH;
    } else {
      process.env.ANSWER_CACHE_PATH = originalPath;
    }

    process.chdir(originalCwd);
  });

  it("uses the env override for the cache path", () => {
    process.env.ANSWER_CACHE_PATH = "./custom/answer-cache.json";

    expect(getAnswerCachePath()).toBe(
      path.resolve(originalCwd, "./custom/answer-cache.json"),
    );
  });

  it("returns an empty cache for a missing file", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "job-tool-answer-cache-"));
    const cache = await readAnswerCache(path.join(tempDir, "missing-cache.json"));

    expect(cache).toEqual({ answers: {} });
  });

  it("writes resolved answers to a JSON file in a visible format", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "job-tool-answer-cache-"));
    const cachePath = path.join(tempDir, "answer-cache.json");
    process.env.ANSWER_CACHE_PATH = cachePath;

    await persistResolvedAnswer({
      question: { label: "How many years of experience do you have with Linux?", inputType: "text" },
      classified: {
        type: "years_of_experience",
        normalizedText: "how many years of experience do you have with linux",
        confidence: 0.93,
      },
      resolved: {
        questionType: "years_of_experience",
        strategy: "resume-derived",
        answer: "0",
        confidence: 0.75,
        confidenceLabel: "medium",
        source: "resume",
      },
    });

    const content = await readFile(cachePath, "utf8");
    expect(content).toContain("\"answers\"");
    expect(content).toContain("\"how many years of experience do you have with linux\"");

    const cache = await readAnswerCache(cachePath);
    expect(
      cache.answers[getAnswerCacheKey({
        type: "years_of_experience",
        normalizedText: "how many years of experience do you have with linux",
        confidence: 0.93,
      })]?.answer,
    ).toBe("0");
  });

  it("updates existing entries by normalized question", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "job-tool-answer-cache-"));
    const cachePath = path.join(tempDir, "answer-cache.json");

    await persistResolvedAnswer({
      cachePath,
      question: { label: "What is your net salary expectation for this position?", inputType: "text" },
      classified: {
        type: "salary",
        normalizedText: "what is your net salary expectation for this position",
        confidence: 0.95,
      },
      resolved: {
        questionType: "salary",
        strategy: "needs-review",
        answer: null,
        confidence: 0.2,
        confidenceLabel: "manual_review",
        source: "manual",
      },
    });

    await persistResolvedAnswer({
      cachePath,
      question: { label: "What is your net salary expectation for this position?", inputType: "text" },
      classified: {
        type: "salary",
        normalizedText: "what is your net salary expectation for this position",
        confidence: 0.95,
      },
      resolved: {
        questionType: "salary",
        strategy: "deterministic",
        answer: "Open to market-rate mid-level backend roles",
        confidence: 0.8,
        confidenceLabel: "medium",
        source: "candidate-profile",
      },
    });

    const cache = await readAnswerCache(cachePath);
    expect(Object.keys(cache.answers)).toHaveLength(1);
    expect(cache.answers["what is your net salary expectation for this position"]?.strategy)
      .toBe("deterministic");
  });

  it("skips writing to the default cache path during vitest runs", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "job-tool-answer-cache-"));
    process.chdir(tempDir);
    delete process.env.ANSWER_CACHE_PATH;

    await persistResolvedAnswer({
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
      },
    });

    await expect(access(path.join(tempDir, "answer-cache.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("throws invalid cache file content errors through to the caller", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "job-tool-answer-cache-"));
    const cachePath = path.join(tempDir, "answer-cache.json");
    await writeFile(cachePath, "{invalid json", "utf8");

    await expect(readAnswerCache(cachePath)).rejects.toBeInstanceOf(SyntaxError);
  });
});
