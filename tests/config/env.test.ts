import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

describe("env config", () => {
  afterEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  it("reads required env vars", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.DATABASE_URL = "file:./dev.db";

    const module = await import("../../src/config/env.js");

    expect(module.required("OPENAI_API_KEY")).toBe("test-key");
    expect(module.createEnv()).toEqual({
      OPENAI_API_KEY: "test-key",
      DATABASE_URL: "file:./dev.db",
    });
    expect(module.env.DATABASE_URL).toBe("file:./dev.db");
  });

  it("throws when a required env var is missing", async () => {
    const module = await import("../../src/config/env.js");
    delete process.env.OPENAI_API_KEY;

    expect(() => module.required("OPENAI_API_KEY")).toThrow(
      "Missing required env var: OPENAI_API_KEY",
    );
  });
});
