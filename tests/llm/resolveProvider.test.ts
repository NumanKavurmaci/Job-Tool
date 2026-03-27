import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

describe("resolveProvider", () => {
  afterEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  it("resolves the OpenAI provider", async () => {
    process.env.LLM_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-key";
    process.env.DATABASE_URL = "file:./dev.db";

    const module = await import("../../src/llm/providers/resolveProvider.js");
    const provider = module.resolveProvider();

    expect(provider.name).toBe("openai");
    expect(module.getConfiguredProviderInfo()).toEqual({
      provider: "openai",
      model: "gpt-4.1-mini",
    });
  });

  it("resolves the local provider", async () => {
    process.env.LLM_PROVIDER = "local";
    process.env.LOCAL_LLM_BASE_URL = "http://127.0.0.1:1234/v1";
    process.env.LOCAL_LLM_MODEL = "openai/gpt-oss-20b";
    process.env.DATABASE_URL = "file:./dev.db";

    const module = await import("../../src/llm/providers/resolveProvider.js");
    const provider = module.resolveProvider();

    expect(provider.name).toBe("local");
    expect(module.getConfiguredProviderInfo()).toEqual({
      provider: "local",
      model: "openai/gpt-oss-20b",
    });
  });
});
