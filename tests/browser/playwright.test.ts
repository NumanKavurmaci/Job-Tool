import { beforeEach, describe, expect, it, vi } from "vitest";

const newPageMock = vi.fn();
const closeMock = vi.fn();
const launchMock = vi.fn();

vi.mock("@playwright/test", () => ({
  chromium: {
    launch: launchMock,
  },
}));

describe("withPage", () => {
  beforeEach(() => {
    newPageMock.mockReset();
    closeMock.mockReset();
    launchMock.mockReset();
  });

  it("opens a browser, creates a page, and closes it after success", async () => {
    const page = { id: "page" };
    const browser = {
      newPage: newPageMock.mockResolvedValue(page),
      close: closeMock.mockResolvedValue(undefined),
    };
    launchMock.mockResolvedValue(browser);

    const { withPage } = await import("../../src/browser/playwright.js");
    const result = await withPage(async (receivedPage, receivedBrowser) => {
      expect(receivedPage).toBe(page);
      expect(receivedBrowser).toBe(browser);
      return "done";
    });

    expect(launchMock).toHaveBeenCalledWith({ headless: false });
    expect(result).toBe("done");
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it("closes the browser when the callback throws", async () => {
    const page = { id: "page" };
    const browser = {
      newPage: newPageMock.mockResolvedValue(page),
      close: closeMock.mockResolvedValue(undefined),
    };
    launchMock.mockResolvedValue(browser);

    const { withPage } = await import("../../src/browser/playwright.js");

    await expect(
      withPage(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(closeMock).toHaveBeenCalledTimes(1);
  });
});
