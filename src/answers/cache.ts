import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ResolvedAnswer } from "./types.js";
import type { ClassifiedQuestion, InputQuestion } from "../questions/types.js";

export interface CachedResolvedAnswer {
  normalizedQuestion: string;
  label: string;
  questionType: string;
  strategy: ResolvedAnswer["strategy"];
  answer: ResolvedAnswer["answer"];
  confidenceLabel: ResolvedAnswer["confidenceLabel"];
  source: ResolvedAnswer["source"];
  notes?: string[];
  updatedAt: string;
}

export interface AnswerCacheFile {
  answers: Record<string, CachedResolvedAnswer>;
}

export function getAnswerCachePath(): string {
  return process.env.ANSWER_CACHE_PATH
    ? path.resolve(process.env.ANSWER_CACHE_PATH)
    : path.resolve(process.cwd(), "answer-cache.json");
}

export function getAnswerCacheKey(classified: ClassifiedQuestion): string {
  return classified.normalizedText;
}

async function loadAnswerCacheFile(cachePath: string): Promise<AnswerCacheFile> {
  try {
    const content = await readFile(cachePath, "utf8");
    return JSON.parse(content) as AnswerCacheFile;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { answers: {} };
    }

    throw error;
  }
}

export async function readAnswerCache(
  cachePath = getAnswerCachePath(),
): Promise<AnswerCacheFile> {
  return loadAnswerCacheFile(cachePath);
}

export async function persistResolvedAnswer(input: {
  question: InputQuestion;
  classified: ClassifiedQuestion;
  resolved: ResolvedAnswer;
  cachePath?: string;
}): Promise<void> {
  if (process.env.VITEST && !process.env.ANSWER_CACHE_PATH && !input.cachePath) {
    return;
  }

  const cachePath = input.cachePath ?? getAnswerCachePath();
  const cache = await loadAnswerCacheFile(cachePath);
  const key = getAnswerCacheKey(input.classified);

  cache.answers[key] = {
    normalizedQuestion: input.classified.normalizedText,
    label: input.question.label,
    questionType: input.classified.type,
    strategy: input.resolved.strategy,
    answer: input.resolved.answer,
    confidenceLabel: input.resolved.confidenceLabel,
    source: input.resolved.source,
    ...(input.resolved.notes ? { notes: input.resolved.notes } : {}),
    updatedAt: new Date().toISOString(),
  };

  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}
