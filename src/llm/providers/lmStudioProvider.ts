import { env } from "../../config/env.js";
import { AppError } from "../../utils/errors.js";
import type { LlmParseResponse, LlmProvider, ParseJobRequest } from "../types.js";

type LmStudioResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

export class LMStudioProvider implements LlmProvider {
  name = "local" as const;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(
    baseUrl = env.LOCAL_LLM_BASE_URL ?? "",
    model = env.LOCAL_LLM_MODEL ?? "",
    timeoutMs = env.LOCAL_LLM_TIMEOUT_MS,
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.model = model;
    this.timeoutMs = timeoutMs;
  }

  async parseJob(request: ParseJobRequest): Promise<LlmParseResponse> {
    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          messages: [
            {
              role: "user",
              content: request.prompt,
            },
          ],
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const message =
        error instanceof Error && error.name === "TimeoutError"
          ? `Local LLM request timed out after ${this.timeoutMs}ms.`
          : `Failed to reach LM Studio at ${this.baseUrl}.`;
      throw new AppError({
        message,
        phase: "llm",
        code: "LLM_PROVIDER_UNREACHABLE",
        cause: error,
        details: { provider: this.name, baseUrl: this.baseUrl },
      });
    }

    if (!response.ok) {
      throw new AppError({
        message: `LM Studio request failed with status ${response.status}.`,
        phase: "llm",
        code: "LLM_PROVIDER_HTTP_ERROR",
        details: { provider: this.name, status: response.status },
      });
    }

    const data = (await response.json()) as LmStudioResponse;
    const text = data.choices?.[0]?.message?.content?.trim();

    if (!text) {
      throw new AppError({
        message: "LM Studio returned an empty response.",
        phase: "llm",
        code: "LLM_EMPTY_RESPONSE",
        details: { provider: this.name },
      });
    }

    return {
      text,
      provider: this.name,
      model: this.model,
    };
  }
}
