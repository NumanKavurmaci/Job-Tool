import OpenAI from "openai";
import { env } from "../../config/env.js";
import { AppError } from "../../utils/errors.js";
import type { LlmParseResponse, LlmProvider, ParseJobRequest } from "../types.js";

export class OpenAIProvider implements LlmProvider {
  name = "openai" as const;
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(
    client = new OpenAI({ apiKey: env.OPENAI_API_KEY }),
    model = env.OPENAI_MODEL,
  ) {
    this.client = client;
    this.model = model;
  }

  async parseJob(request: ParseJobRequest): Promise<LlmParseResponse> {
    let response;
    try {
      response = await this.client.responses.create({
        model: this.model,
        input: request.prompt,
      });
    } catch (error) {
      throw new AppError({
        message: "OpenAI request failed.",
        phase: "llm",
        code: "LLM_PROVIDER_REQUEST_FAILED",
        cause: error,
        details: { provider: this.name, model: this.model },
      });
    }

    return {
      text: response.output_text?.trim() ?? "",
      provider: this.name,
      model: this.model,
    };
  }
}
