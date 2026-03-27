import { beforeEach, describe, expect, it, vi } from "vitest";

const extractMock = vi.fn();
const resolveAdapterMock = vi.fn(() => ({ extract: extractMock }));

vi.mock("../../src/adapters/resolveAdapter.js", () => ({
  resolveAdapter: resolveAdapterMock,
}));

describe("extractJobText", () => {
  beforeEach(() => {
    extractMock.mockReset();
    resolveAdapterMock.mockClear();
  });

  it("resolves an adapter and delegates extraction", async () => {
    const page = { marker: "page" };
    const expected = {
      rawText: "body",
      title: null,
      company: null,
      location: null,
      platform: "generic",
      applyUrl: null,
      currentUrl: "https://example.com",
      descriptionText: null,
      requirementsText: null,
      benefitsText: null,
    };
    extractMock.mockResolvedValue(expected);

    const { extractJobText } = await import("../../src/parser/extractJobText.js");
    const result = await extractJobText(page as never, "https://example.com");

    expect(resolveAdapterMock).toHaveBeenCalledWith("https://example.com");
    expect(extractMock).toHaveBeenCalledWith(page, "https://example.com");
    expect(result).toEqual(expected);
  });
});
