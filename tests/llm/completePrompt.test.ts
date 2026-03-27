import { beforeEach, describe, expect, it, vi } from "vitest";

const providerParseMock = vi.fn();
const infoMock = vi.fn();
const errorMock = vi.fn();

vi.mock("../../src/llm/providers/resolveProvider.js", () => ({
  resolveProvider: () => ({
    name: "local",
    parseJob: providerParseMock,
  }),
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    info: infoMock,
    error: errorMock,
  },
}));

describe("completePrompt", () => {
  beforeEach(() => {
    vi.resetModules();
    providerParseMock.mockReset();
    infoMock.mockReset();
    errorMock.mockReset();
  });

  it("returns provider metadata and text", async () => {
    providerParseMock.mockResolvedValue({
      text: "answer",
      provider: "local",
      model: "openai/gpt-oss-20b",
    });

    const { completePrompt } = await import("../../src/llm/completePrompt.js");
    const result = await completePrompt("Prompt");

    expect(result).toEqual({
      text: "answer",
      provider: "local",
      model: "openai/gpt-oss-20b",
    });
    expect(infoMock).toHaveBeenCalled();
  });

  it("throws on empty responses", async () => {
    providerParseMock.mockResolvedValue({
      text: "   ",
      provider: "local",
      model: "openai/gpt-oss-20b",
    });

    const { completePrompt } = await import("../../src/llm/completePrompt.js");
    await expect(completePrompt("Prompt")).rejects.toThrow("empty response");
    expect(errorMock).toHaveBeenCalled();
  });

  it("logs and rethrows provider failures", async () => {
    providerParseMock.mockRejectedValue(new Error("provider failed"));

    const { completePrompt } = await import("../../src/llm/completePrompt.js");
    await expect(completePrompt("Prompt")).rejects.toThrow("provider failed");
    expect(errorMock).toHaveBeenCalled();
  });
});
