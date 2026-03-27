import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { AppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

export interface BrowserSessionOptions {
  persistentProfilePath?: string;
  storageStatePath?: string;
  persistStorageState?: boolean;
}

interface BrowserRuntime {
  browser: Browser | null;
  context: BrowserContext;
  close: () => Promise<void>;
}

function getLaunchOptions() {
  const slowMo = Number.parseInt(process.env.PLAYWRIGHT_SLOW_MO_MS ?? "", 10);

  return {
    headless: false,
    ...(Number.isFinite(slowMo) && slowMo > 0 ? { slowMo } : {}),
  };
}

async function createBrowserRuntime(
  options: BrowserSessionOptions,
): Promise<BrowserRuntime> {
  const launchOptions = getLaunchOptions();
  logger.info(
    {
      event: "browser.launch.started",
      persistentProfilePath: options.persistentProfilePath ?? null,
      storageStatePath: options.storageStatePath ?? null,
      persistStorageState: options.persistStorageState === true,
      headless: launchOptions.headless,
      slowMo: "slowMo" in launchOptions ? launchOptions.slowMo : 0,
    },
    "Launching Playwright browser",
  );

  try {
    if (options.persistentProfilePath) {
      await mkdir(options.persistentProfilePath, { recursive: true });
      const context = await chromium.launchPersistentContext(
        options.persistentProfilePath,
        launchOptions,
      );

      logger.info(
        {
          event: "browser.launch.succeeded",
          mode: "persistent",
          persistentProfilePath: options.persistentProfilePath,
        },
        "Playwright persistent browser launched",
      );

      return {
        browser: context.browser(),
        context,
        close: async () => context.close(),
      };
    }

    const browser = await chromium.launch(launchOptions);
    const context = await browser.newContext({
      ...(options.storageStatePath && existsSync(options.storageStatePath)
        ? { storageState: options.storageStatePath }
        : {}),
    });

    logger.info(
      {
        event: "browser.launch.succeeded",
        mode: "ephemeral",
        storageStatePath: options.storageStatePath ?? null,
      },
      "Playwright browser launched",
    );

    return {
      browser,
      context,
      close: async () => browser.close(),
    };
  } catch (error) {
    logger.error(
      {
        event: "browser.launch.failed",
        persistentProfilePath: options.persistentProfilePath ?? null,
        storageStatePath: options.storageStatePath ?? null,
        error,
      },
      "Failed to launch Playwright browser",
    );
    throw new AppError({
      message:
        "Failed to launch the Playwright browser. Check logs/app.log for browser launch details.",
      phase: "browser",
      code: "BROWSER_LAUNCH_FAILED",
      cause: error,
      details: {
        persistentProfilePath: options.persistentProfilePath ?? null,
        storageStatePath: options.storageStatePath ?? null,
      },
    });
  }
}

export async function withPage<T>(
  fnOrOptions: BrowserSessionOptions | ((page: Page, browser: Browser) => Promise<T>),
  maybeFn?: (page: Page, browser: Browser) => Promise<T>,
): Promise<T> {
  const options = typeof fnOrOptions === "function" ? {} : fnOrOptions;
  const fn = typeof fnOrOptions === "function" ? fnOrOptions : maybeFn;

  if (!fn) {
    throw new Error("withPage requires a page callback.");
  }

  const runtime = await createBrowserRuntime(options);
  const page = await runtime.context.newPage();
  if ("bringToFront" in page && typeof page.bringToFront === "function") {
    await page.bringToFront().catch(() => undefined);
  }
  logger.info(
    {
      event: "browser.page.created",
      url: page.url(),
    },
    "Playwright page created",
  );

  try {
    return await fn(page, runtime.browser as Browser);
  } finally {
    if (options.persistStorageState && options.storageStatePath) {
      await mkdir(dirname(options.storageStatePath), { recursive: true });
      await runtime.context.storageState({ path: options.storageStatePath });
    }
    await runtime.close();
    logger.info(
      {
        event: "browser.closed",
        persistentProfilePath: options.persistentProfilePath ?? null,
      },
      "Playwright browser closed",
    );
  }
}
