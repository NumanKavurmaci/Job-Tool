import dotenv from "dotenv";

dotenv.config();

export type LlmProviderName = "openai" | "local";

export function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }

  if (name === "OPENAI_API_KEY" && /^your[_-]?key[_-]?here$/i.test(normalized)) {
    return undefined;
  }

  return normalized;
}

function optionalPositiveInteger(name: string, fallback: number): number {
  const value = optional(name);
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

export function createEnv() {
  const configuredProvider = optional("LLM_PROVIDER");
  const DATABASE_URL = required("DATABASE_URL");
  const OPENAI_MODEL = optional("OPENAI_MODEL") ?? "gpt-4.1-mini";
  const OPENAI_API_KEY = optional("OPENAI_API_KEY");
  const LOCAL_LLM_BASE_URL = optional("LOCAL_LLM_BASE_URL");
  const LOCAL_LLM_MODEL = optional("LOCAL_LLM_MODEL");
  const LOCAL_LLM_TIMEOUT_MS = optionalPositiveInteger("LOCAL_LLM_TIMEOUT_MS", 120_000);
  const LINKEDIN_MANUAL_AUTH_WINDOW_MS = optionalPositiveInteger(
    "LINKEDIN_MANUAL_AUTH_WINDOW_MS",
    120_000,
  );
  const LINKEDIN_USERNAME = optional("LINKEDIN_USERNAME");
  const LINKEDIN_PASSWORD = optional("LINKEDIN_PASSWORD");
  const LINKEDIN_SESSION_STATE_PATH =
    optional("LINKEDIN_SESSION_STATE_PATH") ?? ".auth/linkedin-session.json";
  const LINKEDIN_BROWSER_PROFILE_PATH =
    optional("LINKEDIN_BROWSER_PROFILE_PATH") ?? ".auth/linkedin-profile";
  const hasLocalConfiguration = Boolean(LOCAL_LLM_BASE_URL && LOCAL_LLM_MODEL);
  const LLM_PROVIDER = (configuredProvider ??
    (hasLocalConfiguration ? "local" : "openai")) as LlmProviderName;

  if (LLM_PROVIDER !== "openai" && LLM_PROVIDER !== "local") {
    throw new Error(`Unsupported LLM_PROVIDER: ${LLM_PROVIDER}`);
  }

  if (LLM_PROVIDER === "openai" && !OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required when LLM_PROVIDER=openai");
  }

  if (LLM_PROVIDER === "local") {
    if (!LOCAL_LLM_BASE_URL) {
      throw new Error("LOCAL_LLM_BASE_URL is required when LLM_PROVIDER=local");
    }

    if (!LOCAL_LLM_MODEL) {
      throw new Error("LOCAL_LLM_MODEL is required when LLM_PROVIDER=local");
    }
  }

  if ((LINKEDIN_USERNAME && !LINKEDIN_PASSWORD) || (!LINKEDIN_USERNAME && LINKEDIN_PASSWORD)) {
    throw new Error(
      "LINKEDIN_USERNAME and LINKEDIN_PASSWORD must be provided together",
    );
  }

  return {
    LLM_PROVIDER,
    OPENAI_API_KEY,
    OPENAI_MODEL,
    LOCAL_LLM_BASE_URL,
    LOCAL_LLM_MODEL,
    LOCAL_LLM_TIMEOUT_MS,
    LINKEDIN_MANUAL_AUTH_WINDOW_MS,
    DATABASE_URL,
      LINKEDIN_USERNAME,
      LINKEDIN_PASSWORD,
      LINKEDIN_SESSION_STATE_PATH,
      LINKEDIN_BROWSER_PROFILE_PATH,
  };
}

export const env = createEnv();
