import { env } from "../../config/env.js";
import type { LlmProvider } from "../types.js";
import { LMStudioProvider } from "./lmStudioProvider.js";
import { OpenAIProvider } from "./openaiProvider.js";

export function getConfiguredProviderInfo(): { provider: "openai" | "local"; model: string } {
  if (env.LLM_PROVIDER === "openai") {
    return {
      provider: "openai",
      model: env.OPENAI_MODEL,
    };
  }

  if (env.LLM_PROVIDER === "local") {
    return {
      provider: "local",
      model: env.LOCAL_LLM_MODEL ?? "",
    };
  }

  throw new Error(`Unsupported LLM provider: ${env.LLM_PROVIDER}`);
}

export function resolveProvider(): LlmProvider {
  if (env.LLM_PROVIDER === "openai") {
    return new OpenAIProvider();
  }

  if (env.LLM_PROVIDER === "local") {
    return new LMStudioProvider();
  }

  throw new Error(`Unsupported LLM provider: ${env.LLM_PROVIDER}`);
}
