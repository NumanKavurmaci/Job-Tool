import type { PrismaClient } from "@prisma/client";
import { prisma } from "../db/client.js";
import { logger } from "../utils/logger.js";
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

export interface AnswerCacheStore {
  answerCacheEntry: Pick<
    PrismaClient["answerCacheEntry"],
    "findUnique" | "findMany" | "upsert"
  >;
}

export interface AnswerCacheFile {
  answers: Record<string, CachedResolvedAnswer>;
}

function deserializeCachedAnswer(entry: {
  normalizedQuestion: string;
  label: string;
  questionType: string;
  strategy: string;
  answerJson: string;
  confidenceLabel: string;
  source: string;
  notesJson: string | null;
  updatedAt: Date;
}): CachedResolvedAnswer {
  return {
    normalizedQuestion: entry.normalizedQuestion,
    label: entry.label,
    questionType: entry.questionType,
    strategy: entry.strategy as ResolvedAnswer["strategy"],
    answer: JSON.parse(entry.answerJson) as ResolvedAnswer["answer"],
    confidenceLabel: entry.confidenceLabel as ResolvedAnswer["confidenceLabel"],
    source: entry.source as ResolvedAnswer["source"],
    ...(entry.notesJson ? { notes: JSON.parse(entry.notesJson) as string[] } : {}),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

export function getAnswerCacheKey(classified: ClassifiedQuestion): string {
  return classified.normalizedText;
}

export async function readAnswerCache(
  store: AnswerCacheStore = prisma,
): Promise<AnswerCacheFile> {
  try {
    const entries = await store.answerCacheEntry.findMany({
      orderBy: { updatedAt: "desc" },
    });

    return {
      answers: Object.fromEntries(
        entries.map((entry) => [
          entry.normalizedQuestion,
          deserializeCachedAnswer(entry),
        ]),
      ),
    };
  } catch (error) {
    logger.warn(
      { event: "answer.cache.read_failed", error },
      "Failed to read answer cache from the database",
    );
    return { answers: {} };
  }
}

export async function readCachedResolvedAnswer(
  classified: ClassifiedQuestion,
  store: AnswerCacheStore = prisma,
): Promise<CachedResolvedAnswer | null> {
  try {
    const entry = await store.answerCacheEntry.findUnique({
      where: { normalizedQuestion: getAnswerCacheKey(classified) },
    });

    return entry ? deserializeCachedAnswer(entry) : null;
  } catch (error) {
    logger.warn(
      {
        event: "answer.cache.lookup_failed",
        normalizedQuestion: classified.normalizedText,
        error,
      },
      "Failed to look up cached answer from the database",
    );
    return null;
  }
}

export async function persistResolvedAnswer(input: {
  question: InputQuestion;
  classified: ClassifiedQuestion;
  resolved: ResolvedAnswer;
  store?: AnswerCacheStore;
}): Promise<void> {
  try {
    const store = input.store ?? prisma;

    await store.answerCacheEntry.upsert({
      where: { normalizedQuestion: getAnswerCacheKey(input.classified) },
      update: {
        label: input.question.label,
        questionType: input.classified.type,
        strategy: input.resolved.strategy,
        answerJson: JSON.stringify(input.resolved.answer),
        confidenceLabel: input.resolved.confidenceLabel,
        source: input.resolved.source,
        notesJson: input.resolved.notes ? JSON.stringify(input.resolved.notes) : null,
      },
      create: {
        normalizedQuestion: input.classified.normalizedText,
        label: input.question.label,
        questionType: input.classified.type,
        strategy: input.resolved.strategy,
        answerJson: JSON.stringify(input.resolved.answer),
        confidenceLabel: input.resolved.confidenceLabel,
        source: input.resolved.source,
        notesJson: input.resolved.notes ? JSON.stringify(input.resolved.notes) : null,
      },
    });
  } catch (error) {
    logger.warn(
      {
        event: "answer.cache.persist_failed",
        normalizedQuestion: input.classified.normalizedText,
        error,
      },
      "Failed to persist resolved answer to the database",
    );
  }
}
