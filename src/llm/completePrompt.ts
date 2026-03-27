import { logger } from "../utils/logger.js";
import { resolveProvider } from "./providers/resolveProvider.js";
import type { LlmProviderName } from "./types.js";

export interface PromptCompletionResult {
  text: string;
  provider: LlmProviderName;
  model: string;
}

export async function completePrompt(prompt: string): Promise<PromptCompletionResult> {
  const provider = resolveProvider();
  const startedAt = Date.now();

  logger.info(
    {
      event: "llm.complete.started",
      provider: provider.name,
      inputLength: prompt.length,
    },
    "Starting prompt completion",
  );

  try {
    const response = await provider.parseJob({ prompt });

    if (!response.text.trim()) {
      throw new Error("The LLM provider returned an empty response.");
    }

    logger.info(
      {
        event: "llm.complete.succeeded",
        provider: response.provider,
        model: response.model,
        inputLength: prompt.length,
        durationMs: Date.now() - startedAt,
      },
      "Prompt completion succeeded",
    );

    return response;
  } catch (error) {
    logger.error(
      {
        event: "llm.complete.failed",
        provider: provider.name,
        durationMs: Date.now() - startedAt,
        reason: error instanceof Error ? error.message : String(error),
      },
      "Prompt completion failed",
    );
    throw error;
  }
}
