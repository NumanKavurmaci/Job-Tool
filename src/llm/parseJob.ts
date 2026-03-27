import { ZodError } from "zod";
import { logger } from "../utils/logger.js";
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

function summarizeValidationError(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
    .join("; ");
}

export async function parseJob(formattedJobText: string): Promise<ParseJobResult> {
  const prompt = buildParseJobPrompt(formattedJobText);
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
      throw new Error("The LLM provider returned an empty response.");
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(response.text);
    } catch (error) {
      throw new Error(
        `The ${response.provider} provider returned invalid JSON.`,
        { cause: error },
      );
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
        throw new Error(
          `The ${response.provider} provider returned JSON that failed schema validation: ${summarizeValidationError(error)}`,
          { cause: error },
        );
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
    throw error;
  }
}
