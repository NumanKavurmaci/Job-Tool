import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/env.js", () => ({
  env: {
    LOCAL_LLM_BASE_URL: "http://127.0.0.1:1234/v1",
    LOCAL_LLM_MODEL: "openai/gpt-oss-20b",
    LOCAL_LLM_TIMEOUT_MS: 120000,
  },
}));

describe("LMStudioProvider", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("calls the local endpoint and returns the model text", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '{"title":"Backend Engineer"}',
            },
          },
        ],
      }),
    }) as typeof fetch;

    const { LMStudioProvider } = await import("../../src/llm/providers/lmStudioProvider.js");
    const provider = new LMStudioProvider();
    const result = await provider.parseJob({ prompt: "Prompt text" });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:1234/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"model":"openai/gpt-oss-20b"'),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(result).toEqual({
      text: '{"title":"Backend Engineer"}',
      provider: "local",
      model: "openai/gpt-oss-20b",
    });
  });

  it("throws a meaningful error when the endpoint is unreachable", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("connection refused")) as typeof fetch;

    const { LMStudioProvider } = await import("../../src/llm/providers/lmStudioProvider.js");
    const provider = new LMStudioProvider();

    await expect(provider.parseJob({ prompt: "Prompt text" })).rejects.toThrow(
      "Failed to reach LM Studio",
    );
  });

  it("uses the configured timeout by default", async () => {
    global.fetch = vi.fn().mockRejectedValue(
      Object.assign(new Error("timeout"), { name: "TimeoutError" }),
    ) as typeof fetch;

    const { LMStudioProvider } = await import("../../src/llm/providers/lmStudioProvider.js");
    const provider = new LMStudioProvider();

    await expect(provider.parseJob({ prompt: "Prompt text" })).rejects.toThrow(
      "Local LLM request timed out after 120000ms.",
    );
  });

  it("throws a meaningful error on empty responses", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [],
      }),
    }) as typeof fetch;

    const { LMStudioProvider } = await import("../../src/llm/providers/lmStudioProvider.js");
    const provider = new LMStudioProvider();

    await expect(provider.parseJob({ prompt: "Prompt text" })).rejects.toThrow(
      "LM Studio returned an empty response.",
    );
  });
});
