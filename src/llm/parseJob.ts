import { ZodError } from "zod";
import { AppError, ensureAppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { parseJsonResponse } from "./json.js";
import { buildParseJobPrompt } from "./prompts.js";
import { resolveProvider } from "./providers/resolveProvider.js";
import { ParsedJobSchema, type ParsedJob } from "./schema.js";
import type { LlmProviderName } from "./types.js";

export interface ParseJobResult {
  parsed: ParsedJob;
  provider: LlmProviderName;
  model: string;
  rawText: string;
}

export type ParseJobOptions = {
  excludeLocation?: boolean;
};

function summarizeValidationError(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
    .join("; ");
}

export async function parseJob(
  formattedJobText: string,
  options: ParseJobOptions = {},
): Promise<ParseJobResult> {
  const prompt = buildParseJobPrompt(
    formattedJobText,
    options.excludeLocation ? { excludeLocation: true } : {},
  );
  const provider = resolveProvider();
  const startedAt = Date.now();

  logger.info(
    {
      event: "llm.parse.started",
      provider: provider.name,
      inputLength: formattedJobText.length,
    },
    "Starting LLM parse",
  );

  try {
    const response = await provider.parseJob({ prompt });
    const durationMs = Date.now() - startedAt;

    if (!response.text.trim()) {
      throw new AppError({
        message: "The LLM provider returned an empty response.",
        phase: "llm",
        code: "LLM_EMPTY_RESPONSE",
        details: { provider: response.provider, model: response.model },
      });
    }

    let parsedJson: unknown;
    try {
      parsedJson = parseJsonResponse(response.text);
    } catch (error) {
      throw new AppError({
        message: `The ${response.provider} provider returned invalid JSON.`,
        phase: "llm",
        code: "LLM_INVALID_JSON",
        cause: error,
        details: { provider: response.provider, model: response.model },
      });
    }

    let parsed: ParsedJob;
    try {
      parsed = ParsedJobSchema.parse(parsedJson);
    } catch (error) {
      if (error instanceof ZodError) {
        logger.error(
          {
            event: "llm.parse.failed",
            provider: response.provider,
            model: response.model,
            durationMs,
            reason: summarizeValidationError(error),
          },
          "LLM response failed schema validation",
        );
        throw new AppError({
          message: `The ${response.provider} provider returned JSON that failed schema validation: ${summarizeValidationError(error)}`,
          phase: "llm",
          code: "LLM_SCHEMA_VALIDATION_FAILED",
          cause: error,
          details: { provider: response.provider, model: response.model },
        });
      }

      throw error;
    }

    logger.info(
      {
        event: "llm.parse.succeeded",
        provider: response.provider,
        model: response.model,
        inputLength: formattedJobText.length,
        durationMs,
      },
      "LLM parse succeeded",
    );

    if (options.excludeLocation) {
      parsed = {
        ...parsed,
        location: null,
      };
    }

    return {
      parsed,
      provider: response.provider,
      model: response.model,
      rawText: response.text,
    };
  } catch (error) {
    logger.error(
      {
        event: "llm.parse.failed",
        provider: provider.name,
        durationMs: Date.now() - startedAt,
        reason: error instanceof Error ? error.message : String(error),
      },
      "LLM parse failed",
    );
    throw ensureAppError(error, {
      message: "LLM parse failed.",
      phase: "llm",
      code: "LLM_PARSE_FAILED",
      details: { provider: provider.name },
    });
  }
}
