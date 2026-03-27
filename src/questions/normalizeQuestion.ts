import type { InputQuestion } from "./types.js";

export function normalizeQuestion(question: InputQuestion): string {
  return [
    question.label,
    question.helpText ?? "",
    question.placeholder ?? "",
    ...(question.options ?? []),
  ]
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
