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
    process.env.LINKEDIN_USERNAME = "user@example.com";
    process.env.LINKEDIN_PASSWORD = "secret";

    const module = await import("../../src/config/env.js");

    expect(module.createEnv()).toEqual({
      LLM_PROVIDER: "openai",
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "gpt-4.1-mini",
      LOCAL_LLM_BASE_URL: "http://127.0.0.1:1234/v1",
      LOCAL_LLM_MODEL: "openai/gpt-oss-20b",
      LOCAL_LLM_TIMEOUT_MS: 120000,
      LINKEDIN_MANUAL_AUTH_WINDOW_MS: 14400000,
      DATABASE_URL: "file:./dev.db",
      LINKEDIN_USERNAME: "user@example.com",
      LINKEDIN_PASSWORD: "secret",
      LINKEDIN_SESSION_STATE_PATH: ".auth/linkedin-session.json",
      LINKEDIN_BROWSER_PROFILE_PATH: ".auth/linkedin-profile",
    });
  });

  it("builds the local config when provider=local", async () => {
    process.env.LLM_PROVIDER = "local";
    process.env.LOCAL_LLM_BASE_URL = "http://127.0.0.1:1234/v1";
    process.env.LOCAL_LLM_MODEL = "openai/gpt-oss-20b";
    process.env.OPENAI_API_KEY = "";
    process.env.DATABASE_URL = "file:./dev.db";
    process.env.LINKEDIN_USERNAME = "";
    process.env.LINKEDIN_PASSWORD = "";

    const module = await import("../../src/config/env.js");

    expect(module.createEnv()).toEqual({
      LLM_PROVIDER: "local",
      OPENAI_API_KEY: undefined,
      OPENAI_MODEL: "gpt-4.1-mini",
      LOCAL_LLM_BASE_URL: "http://127.0.0.1:1234/v1",
      LOCAL_LLM_MODEL: "openai/gpt-oss-20b",
      LOCAL_LLM_TIMEOUT_MS: 120000,
      LINKEDIN_MANUAL_AUTH_WINDOW_MS: 14400000,
      DATABASE_URL: "file:./dev.db",
      LINKEDIN_USERNAME: undefined,
      LINKEDIN_PASSWORD: undefined,
      LINKEDIN_SESSION_STATE_PATH: ".auth/linkedin-session.json",
      LINKEDIN_BROWSER_PROFILE_PATH: ".auth/linkedin-profile",
    });
  });

  it("defaults to local when local configuration is present", async () => {
    delete process.env.LLM_PROVIDER;
    process.env.LOCAL_LLM_BASE_URL = "http://127.0.0.1:1234/v1";
    process.env.LOCAL_LLM_MODEL = "openai/gpt-oss-20b";
    process.env.OPENAI_API_KEY = "your_key_here";
    process.env.DATABASE_URL = "file:./dev.db";
    process.env.LINKEDIN_USERNAME = "";
    process.env.LINKEDIN_PASSWORD = "";

    const module = await import("../../src/config/env.js");

    expect(module.createEnv()).toEqual({
      LLM_PROVIDER: "local",
      OPENAI_API_KEY: undefined,
      OPENAI_MODEL: "gpt-4.1-mini",
      LOCAL_LLM_BASE_URL: "http://127.0.0.1:1234/v1",
      LOCAL_LLM_MODEL: "openai/gpt-oss-20b",
      LOCAL_LLM_TIMEOUT_MS: 120000,
      LINKEDIN_MANUAL_AUTH_WINDOW_MS: 14400000,
      DATABASE_URL: "file:./dev.db",
      LINKEDIN_USERNAME: undefined,
      LINKEDIN_PASSWORD: undefined,
      LINKEDIN_SESSION_STATE_PATH: ".auth/linkedin-session.json",
      LINKEDIN_BROWSER_PROFILE_PATH: ".auth/linkedin-profile",
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

  it("treats the placeholder OpenAI API key as missing", async () => {
    process.env.LLM_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "your_key_here";
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

  it("requires linkedin credentials together when either is provided", async () => {
    process.env.LLM_PROVIDER = "local";
    process.env.DATABASE_URL = "file:./dev.db";
    process.env.LOCAL_LLM_BASE_URL = "http://127.0.0.1:1234/v1";
    process.env.LOCAL_LLM_MODEL = "openai/gpt-oss-20b";
    process.env.LINKEDIN_USERNAME = "user@example.com";
    process.env.LINKEDIN_PASSWORD = "";

    await expect(import("../../src/config/env.js")).rejects.toThrow(
      "LINKEDIN_USERNAME and LINKEDIN_PASSWORD must be provided together",
    );
  });

  it("accepts custom timeout settings and rejects invalid values", async () => {
    process.env.LLM_PROVIDER = "local";
    process.env.DATABASE_URL = "file:./dev.db";
    process.env.LOCAL_LLM_BASE_URL = "http://127.0.0.1:1234/v1";
    process.env.LOCAL_LLM_MODEL = "openai/gpt-oss-20b";
    process.env.LOCAL_LLM_TIMEOUT_MS = "180000";
    process.env.LINKEDIN_MANUAL_AUTH_WINDOW_MS = "7200000";

    let module = await import("../../src/config/env.js");
    expect(module.createEnv().LOCAL_LLM_TIMEOUT_MS).toBe(180000);
    expect(module.createEnv().LINKEDIN_MANUAL_AUTH_WINDOW_MS).toBe(7200000);

    vi.resetModules();
    process.env = {
      ...originalEnv,
      LLM_PROVIDER: "local",
      DATABASE_URL: "file:./dev.db",
      LOCAL_LLM_BASE_URL: "http://127.0.0.1:1234/v1",
      LOCAL_LLM_MODEL: "openai/gpt-oss-20b",
      LOCAL_LLM_TIMEOUT_MS: "0",
    };

    await expect(import("../../src/config/env.js")).rejects.toThrow(
      "LOCAL_LLM_TIMEOUT_MS must be a positive integer",
    );

    vi.resetModules();
    process.env = {
      ...originalEnv,
      LLM_PROVIDER: "local",
      DATABASE_URL: "file:./dev.db",
      LOCAL_LLM_BASE_URL: "http://127.0.0.1:1234/v1",
      LOCAL_LLM_MODEL: "openai/gpt-oss-20b",
      LINKEDIN_MANUAL_AUTH_WINDOW_MS: "0",
    };

    await expect(import("../../src/config/env.js")).rejects.toThrow(
      "LINKEDIN_MANUAL_AUTH_WINDOW_MS must be a positive integer",
    );
  });
});
