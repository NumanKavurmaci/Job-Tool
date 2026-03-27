import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";

export interface BrowserSessionOptions {
  storageStatePath?: string;
  persistStorageState?: boolean;
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

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    ...(options.storageStatePath && existsSync(options.storageStatePath)
      ? { storageState: options.storageStatePath }
      : {}),
  });
  const page = await context.newPage();

  try {
    return await fn(page, browser);
  } finally {
    if (options.persistStorageState && options.storageStatePath) {
      await mkdir(dirname(options.storageStatePath), { recursive: true });
      await context.storageState({ path: options.storageStatePath });
    }
    await browser.close();
  }
}
