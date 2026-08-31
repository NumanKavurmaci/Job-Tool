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

  it("uses separate system/user messages and JSON schema when requested", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"title":null}' } }],
      }),
    }) as typeof fetch;

    const { LMStudioProvider } = await import("../../src/llm/providers/lmStudioProvider.js");
    const provider = new LMStudioProvider();

    await provider.parseJob({
      prompt: "Untrusted input",
      instructions: "Trusted instructions",
      responseFormat: {
        type: "json_schema",
        name: "job_posting",
        schema: { type: "object" },
        strict: true,
      },
    });

    const fetchMock = vi.mocked(global.fetch);
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(options.body)) as {
      messages: Array<{ role: string; content: string }>;
      response_format: { json_schema: { name: string; strict: boolean } };
    };

    expect(body.messages).toEqual([
      { role: "system", content: "Trusted instructions" },
      { role: "user", content: "Untrusted input" },
    ]);
    expect(body.response_format.json_schema).toMatchObject({
      name: "job_posting",
      strict: true,
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

  it("preserves the LM Studio error body for actionable HTTP diagnostics", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () =>
        '{"error":{"message":"Failed to initialize samplers: failed to parse grammar"}}',
    }) as typeof fetch;

    const { LMStudioProvider } = await import("../../src/llm/providers/lmStudioProvider.js");
    const provider = new LMStudioProvider();

    await expect(provider.parseJob({ prompt: "Prompt text" })).rejects.toMatchObject({
      code: "LLM_PROVIDER_HTTP_ERROR",
      phase: "llm",
      details: {
        provider: "local",
        status: 400,
        responseBody: expect.stringContaining("failed to parse grammar"),
      },
    });
    await expect(provider.parseJob({ prompt: "Prompt text" })).rejects.toThrow(
      "failed to parse grammar",
    );
  });

  it("falls back to the status-only error when the HTTP body is empty", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "   ",
    }) as typeof fetch;

    const { LMStudioProvider } = await import("../../src/llm/providers/lmStudioProvider.js");
    const provider = new LMStudioProvider();

    await expect(provider.parseJob({ prompt: "Prompt text" })).rejects.toMatchObject({
      message: "LM Studio request failed with status 503.",
      details: { provider: "local", status: 503 },
    });
  });

  it("falls back to the status-only error when reading the HTTP body fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => {
        throw new Error("body stream closed");
      },
    }) as typeof fetch;

    const { LMStudioProvider } = await import("../../src/llm/providers/lmStudioProvider.js");
    const provider = new LMStudioProvider();

    await expect(provider.parseJob({ prompt: "Prompt text" })).rejects.toMatchObject({
      message: "LM Studio request failed with status 502.",
      details: { provider: "local", status: 502 },
    });
  });

  it("bounds provider error bodies before attaching them to application errors", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "x".repeat(5_000),
    }) as typeof fetch;

    const { LMStudioProvider } = await import("../../src/llm/providers/lmStudioProvider.js");
    const provider = new LMStudioProvider();

    try {
      await provider.parseJob({ prompt: "Prompt text" });
      throw new Error("Expected provider.parseJob to fail");
    } catch (error) {
      expect(error).toMatchObject({
        code: "LLM_PROVIDER_HTTP_ERROR",
        details: { responseBody: "x".repeat(2_000) },
      });
    }
  });

  it("checks local server availability with the models endpoint", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
    }) as typeof fetch;

    const { checkLocalLlmConnection } = await import("../../src/llm/providers/lmStudioProvider.js");

    await expect(checkLocalLlmConnection()).resolves.toBeUndefined();

    expect(global.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:1234/v1/models",
      expect.objectContaining({
        method: "GET",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("throws a preflight error before job parsing when the local server is unreachable", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("connection refused")) as typeof fetch;

    const { checkLocalLlmConnection } = await import("../../src/llm/providers/lmStudioProvider.js");

    await expect(checkLocalLlmConnection()).rejects.toMatchObject({
      name: "AppError",
      phase: "llm",
      code: "LLM_PROVIDER_UNREACHABLE",
    });
    await expect(checkLocalLlmConnection()).rejects.toThrow("LM Studio is not reachable");
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
