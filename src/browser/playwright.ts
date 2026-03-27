import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";

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

async function createBrowserRuntime(
  options: BrowserSessionOptions,
): Promise<BrowserRuntime> {
  if (options.persistentProfilePath) {
    await mkdir(options.persistentProfilePath, { recursive: true });
    const context = await chromium.launchPersistentContext(options.persistentProfilePath, {
      headless: false,
    });

    return {
      browser: context.browser(),
      context,
      close: async () => context.close(),
    };
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    ...(options.storageStatePath && existsSync(options.storageStatePath)
      ? { storageState: options.storageStatePath }
      : {}),
  });

  return {
    browser,
    context,
    close: async () => browser.close(),
  };
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

  try {
    return await fn(page, runtime.browser as Browser);
  } finally {
    if (options.persistStorageState && options.storageStatePath) {
      await mkdir(dirname(options.storageStatePath), { recursive: true });
      await runtime.context.storageState({ path: options.storageStatePath });
    }
    await runtime.close();
  }
}
