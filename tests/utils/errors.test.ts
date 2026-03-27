import { describe, expect, it } from "vitest";
import {
  AppError,
  ensureAppError,
  getErrorMessage,
  serializeError,
} from "../../src/utils/errors.js";

describe("error utilities", () => {
  it("serializes app errors with phase, code, details, and cause", () => {
    const error = new AppError({
      message: "LinkedIn authentication failed.",
      phase: "linkedin_auth",
      code: "LINKEDIN_AUTHENTICATION_FAILED",
      details: { url: "https://www.linkedin.com/jobs/view/1" },
      cause: new Error("checkpoint"),
    });

    expect(serializeError(error)).toEqual({
      name: "AppError",
      message: "LinkedIn authentication failed.",
      phase: "linkedin_auth",
      code: "LINKEDIN_AUTHENTICATION_FAILED",
      details: { url: "https://www.linkedin.com/jobs/view/1" },
      cause: {
        name: "Error",
        message: "checkpoint",
      },
    });
  });

  it("formats user-facing messages with phase prefixes", () => {
    const error = new AppError({
      message: "Failed to save job analysis to the database.",
      phase: "database",
      code: "DATABASE_WRITE_FAILED",
    });

    expect(getErrorMessage(error)).toBe(
      "[database] Failed to save job analysis to the database.",
    );
  });

  it("wraps unknown failures and preserves existing app errors", () => {
    const wrapped = ensureAppError(new Error("socket hang up"), {
      message: "OpenAI request failed.",
      phase: "llm",
      code: "LLM_PROVIDER_REQUEST_FAILED",
    });

    expect(wrapped).toBeInstanceOf(AppError);
    expect(wrapped.phase).toBe("llm");

    const original = new AppError({
      message: "Resume file was not found.",
      phase: "resume",
      code: "RESUME_FILE_NOT_FOUND",
    });

    expect(ensureAppError(original, {
      message: "fallback",
      phase: "resume",
      code: "FALLBACK",
    })).toBe(original);
  });

  it("serializes non-error values safely", () => {
    expect(serializeError("plain failure")).toEqual({
      name: "UnknownError",
      message: "plain failure",
    });
  });
});
