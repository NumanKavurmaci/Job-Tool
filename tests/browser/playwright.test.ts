import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const newPageMock = vi.fn();
const storageStateMock = vi.fn();
const newContextMock = vi.fn();
const closeMock = vi.fn();
const launchMock = vi.fn();
const launchPersistentContextMock = vi.fn();
const loggerInfoMock = vi.fn();
const loggerWarnMock = vi.fn();
const loggerErrorMock = vi.fn();

vi.mock("@playwright/test", () => ({
  chromium: {
    launch: launchMock,
    launchPersistentContext: launchPersistentContextMock,
  },
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    info: loggerInfoMock,
    warn: loggerWarnMock,
    error: loggerErrorMock,
  },
}));

describe("withPage", () => {
  beforeEach(() => {
    newPageMock.mockReset();
    storageStateMock.mockReset();
    newContextMock.mockReset();
    closeMock.mockReset();
    launchMock.mockReset();
    launchPersistentContextMock.mockReset();
    loggerInfoMock.mockReset();
    loggerWarnMock.mockReset();
    loggerErrorMock.mockReset();
    delete process.env.PLAYWRIGHT_SLOW_MO_MS;
  });

  it("opens a browser, creates a page, and closes it after success", async () => {
    const page = { id: "page", url: vi.fn().mockReturnValue("about:blank") };
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
    expect(loggerInfoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "browser.launch.started",
      }),
      "Launching Playwright browser",
    );
    expect(loggerInfoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "browser.page.created",
      }),
      "Playwright page created",
    );
  });

  it("loads and persists storage state when requested", async () => {
    const page = { id: "page", url: vi.fn().mockReturnValue("about:blank") };
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

  it("uses a persistent browser profile when requested", async () => {
    const page = { id: "page", url: vi.fn().mockReturnValue("about:blank") };
    const persistentContext = {
      newPage: newPageMock.mockResolvedValue(page),
      storageState: storageStateMock.mockResolvedValue(undefined),
      browser: vi.fn().mockReturnValue(null),
      close: closeMock.mockResolvedValue(undefined),
    };
    const dir = mkdtempSync(join(tmpdir(), "job-tool-profile-"));
    const storageStatePath = join(dir, "linkedin-session.json");
    const persistentProfilePath = join(dir, "linkedin-profile");
    launchPersistentContextMock.mockResolvedValue(persistentContext);

    const { withPage } = await import("../../src/browser/playwright.js");
    try {
      await withPage(
        {
          persistentProfilePath,
          storageStatePath,
          persistStorageState: true,
        },
        async () => "done",
      );

      expect(launchPersistentContextMock).toHaveBeenCalledWith(persistentProfilePath, {
        headless: false,
      });
      expect(launchMock).not.toHaveBeenCalled();
      expect(storageStateMock).toHaveBeenCalledWith({
        path: storageStatePath,
      });
      expect(closeMock).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("supports optional slow motion for easier visual debugging", async () => {
    const page = { id: "page", url: vi.fn().mockReturnValue("about:blank") };
    const context = {
      newPage: newPageMock.mockResolvedValue(page),
      storageState: storageStateMock.mockResolvedValue(undefined),
    };
    const browser = {
      newContext: newContextMock.mockResolvedValue(context),
      close: closeMock.mockResolvedValue(undefined),
    };
    launchMock.mockResolvedValue(browser);
    process.env.PLAYWRIGHT_SLOW_MO_MS = "250";

    const { withPage } = await import("../../src/browser/playwright.js");
    await withPage(async () => "done");

    expect(launchMock).toHaveBeenCalledWith({ headless: false, slowMo: 250 });
  });

  it("closes the browser when the callback throws", async () => {
    const page = { id: "page", url: vi.fn().mockReturnValue("about:blank") };
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

  it("warns and still closes cleanly if persisting storage state fails", async () => {
    const page = { id: "page", url: vi.fn().mockReturnValue("about:blank") };
    const context = {
      newPage: newPageMock.mockResolvedValue(page),
      storageState: storageStateMock.mockRejectedValue(new Error("context closed")),
    };
    const browser = {
      newContext: newContextMock.mockResolvedValue(context),
      close: closeMock.mockResolvedValue(undefined),
    };
    launchMock.mockResolvedValue(browser);

    const { withPage } = await import("../../src/browser/playwright.js");
    await expect(
      withPage(
        {
          storageStatePath: join(tmpdir(), "job-tool-storage-state.json"),
          persistStorageState: true,
        },
        async () => "done",
      ),
    ).resolves.toBe("done");

    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "browser.storage_state.persist_failed",
      }),
      "Failed to persist Playwright storage state",
    );
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it("wraps browser launch failures in a clear app error", async () => {
    launchMock.mockRejectedValue(new Error("missing chromium"));

    const { withPage } = await import("../../src/browser/playwright.js");

    await expect(withPage(async () => "done")).rejects.toMatchObject({
      name: "AppError",
      phase: "browser",
      code: "BROWSER_LAUNCH_FAILED",
      message: "Failed to launch the Playwright browser. Check logs/app.log for browser launch details.",
    });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "browser.launch.failed",
      }),
      "Failed to launch Playwright browser",
    );
  });
});
