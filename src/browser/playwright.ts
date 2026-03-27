import { chromium, type Browser, type Page } from "@playwright/test";

export async function withPage<T>(
  fn: (page: Page, browser: Browser) => Promise<T>,
): Promise<T> {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    return await fn(page, browser);
  } finally {
    await browser.close();
  }
}
