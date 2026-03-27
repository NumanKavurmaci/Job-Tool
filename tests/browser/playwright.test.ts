import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const newPageMock = vi.fn();
const storageStateMock = vi.fn();
const newContextMock = vi.fn();
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
    storageStateMock.mockReset();
    newContextMock.mockReset();
    closeMock.mockReset();
    launchMock.mockReset();
  });

  it("opens a browser, creates a page, and closes it after success", async () => {
    const page = { id: "page" };
    const context = {
      newPage: newPageMock.mockResolvedValue(page),
      storageState: storageStateMock.mockResolvedValue(undefined),
    };
    const browser = {
      newContext: newContextMock.mockResolvedValue(context),
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
    expect(newContextMock).toHaveBeenCalledWith({});
    expect(result).toBe("done");
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it("loads and persists storage state when requested", async () => {
    const page = { id: "page" };
    const context = {
      newPage: newPageMock.mockResolvedValue(page),
      storageState: storageStateMock.mockResolvedValue(undefined),
    };
    const browser = {
      newContext: newContextMock.mockResolvedValue(context),
      close: closeMock.mockResolvedValue(undefined),
    };
    launchMock.mockResolvedValue(browser);
    const dir = mkdtempSync(join(tmpdir(), "job-tool-browser-"));
    const storageStatePath = join(dir, "linkedin-session.json");
    writeFileSync(storageStatePath, "{}");

    const { withPage } = await import("../../src/browser/playwright.js");
    try {
      await withPage(
        {
          storageStatePath,
          persistStorageState: true,
        },
        async () => "done",
      );

      expect(newContextMock).toHaveBeenCalledWith({
        storageState: storageStatePath,
      });
      expect(storageStateMock).toHaveBeenCalledWith({
        path: storageStatePath,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("closes the browser when the callback throws", async () => {
    const page = { id: "page" };
    const context = {
      newPage: newPageMock.mockResolvedValue(page),
      storageState: storageStateMock.mockResolvedValue(undefined),
    };
    const browser = {
      newContext: newContextMock.mockResolvedValue(context),
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
