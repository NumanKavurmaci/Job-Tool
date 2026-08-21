export type LlmProviderName = "openai" | "local";

export interface JsonSchemaResponseFormat {
  type: "json_schema";
  name: string;
  schema: Record<string, unknown>;
  strict: true;
}

export interface ParseJobRequest {
  prompt: string;
  instructions?: string;
  responseFormat?: JsonSchemaResponseFormat;
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
