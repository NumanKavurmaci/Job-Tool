import OpenAI from "openai";
import { env } from "../../config/env.js";
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
    const response = await this.client.responses.create({
      model: this.model,
      input: request.prompt,
    });

    return {
      text: response.output_text?.trim() ?? "",
      provider: this.name,
      model: this.model,
    };
  }
}
