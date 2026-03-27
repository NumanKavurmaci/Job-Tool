import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

describe("env config", () => {
  afterEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  it("builds the OpenAI config when provider=openai", async () => {
    process.env.LLM_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-key";
    process.env.DATABASE_URL = "file:./dev.db";

    const module = await import("../../src/config/env.js");

    expect(module.createEnv()).toEqual({
      LLM_PROVIDER: "openai",
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "gpt-4.1-mini",
      LOCAL_LLM_BASE_URL: "http://127.0.0.1:1234/v1",
      LOCAL_LLM_MODEL: "openai/gpt-oss-20b",
      DATABASE_URL: "file:./dev.db",
    });
  });

  it("builds the local config when provider=local", async () => {
    process.env.LLM_PROVIDER = "local";
    process.env.LOCAL_LLM_BASE_URL = "http://127.0.0.1:1234/v1";
    process.env.LOCAL_LLM_MODEL = "openai/gpt-oss-20b";
    process.env.OPENAI_API_KEY = "";
    process.env.DATABASE_URL = "file:./dev.db";

    const module = await import("../../src/config/env.js");

    expect(module.createEnv()).toEqual({
      LLM_PROVIDER: "local",
      OPENAI_API_KEY: undefined,
      OPENAI_MODEL: "gpt-4.1-mini",
      LOCAL_LLM_BASE_URL: "http://127.0.0.1:1234/v1",
      LOCAL_LLM_MODEL: "openai/gpt-oss-20b",
      DATABASE_URL: "file:./dev.db",
    });
  });

  it("rejects invalid provider configuration", async () => {
    process.env.LLM_PROVIDER = "something-else";
    process.env.DATABASE_URL = "file:./dev.db";

    await expect(import("../../src/config/env.js")).rejects.toThrow("Unsupported LLM_PROVIDER");
  });

  it("requires an API key in OpenAI mode", async () => {
    process.env.LLM_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "";
    process.env.DATABASE_URL = "file:./dev.db";

    await expect(import("../../src/config/env.js")).rejects.toThrow(
      "OPENAI_API_KEY is required when LLM_PROVIDER=openai",
    );
  });

  it("requires local endpoint settings in local mode", async () => {
    process.env.LLM_PROVIDER = "local";
    process.env.DATABASE_URL = "file:./dev.db";
    process.env.LOCAL_LLM_BASE_URL = "";
    process.env.LOCAL_LLM_MODEL = "";

    await expect(import("../../src/config/env.js")).rejects.toThrow(
      "LOCAL_LLM_BASE_URL is required when LLM_PROVIDER=local",
    );
  });
});
