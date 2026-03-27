export type LlmProviderName = "openai" | "local";

export interface ParseJobRequest {
  prompt: string;
}

export interface LlmParseResponse {
  text: string;
  provider: LlmProviderName;
  model: string;
}

export interface LlmProvider {
  name: LlmProviderName;
  parseJob(request: ParseJobRequest): Promise<LlmParseResponse>;
}
