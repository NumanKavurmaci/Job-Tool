import { beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();
const OpenAIMock = vi.fn(function OpenAIMock(this: object, options: unknown) {
  return createMock(options);
});

vi.mock("openai", () => ({
  default: OpenAIMock,
}));

vi.mock("../../src/config/env.js", () => ({
  env: {
    OPENAI_API_KEY: "test-key",
    OPENAI_MODEL: "gpt-4.1-mini",
  },
}));

describe("OpenAIProvider", () => {
  beforeEach(() => {
    vi.resetModules();
    createMock.mockReset();
    OpenAIMock.mockClear();
  });

  it("calls the OpenAI responses API and returns plain text", async () => {
    const responsesCreate = vi.fn().mockResolvedValue({
      output_text: '{"title":"Backend Engineer"}',
    });
    createMock.mockReturnValue({
      responses: {
        create: responsesCreate,
      },
    });

    const { OpenAIProvider } = await import("../../src/llm/providers/openaiProvider.js");
    const provider = new OpenAIProvider();
    const result = await provider.parseJob({ prompt: "Prompt text" });

    expect(OpenAIMock).toHaveBeenCalledWith({ apiKey: "test-key" });
    expect(responsesCreate).toHaveBeenCalledWith({
      model: "gpt-4.1-mini",
      input: "Prompt text",
    });
    expect(result).toEqual({
      text: '{"title":"Backend Engineer"}',
      provider: "openai",
      model: "gpt-4.1-mini",
    });
  });
});
