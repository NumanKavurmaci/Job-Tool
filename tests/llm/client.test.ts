import { beforeEach, describe, expect, it, vi } from "vitest";

const openAIMock = vi.fn();
const OpenAIMock = vi.fn(function OpenAIMock(this: object, options: unknown) {
  return openAIMock(options);
});

vi.mock("openai", () => ({
  default: OpenAIMock,
}));

vi.mock("../../src/config/env.js", () => ({
  env: {
    OPENAI_API_KEY: "mock-key",
    DATABASE_URL: "file:./dev.db",
  },
}));

describe("llm client", () => {
  beforeEach(() => {
    vi.resetModules();
    openAIMock.mockReset();
    OpenAIMock.mockClear();
  });

  it("creates an OpenAI client with the API key", async () => {
    const instance = { marker: "openai" };
    openAIMock.mockImplementation(() => instance);

    const module = await import("../../src/llm/client.js");

    expect(OpenAIMock).toHaveBeenCalledWith({ apiKey: "mock-key" });
    expect(module.openai).toBe(instance);
  });
});
