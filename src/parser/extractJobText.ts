import type { Page } from "@playwright/test";

export async function extractJobText(page: Page, url: string): Promise<string> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2000);

  const text = await page.locator("body").innerText();
  return text.replace(/\n{3,}/g, "\n\n").trim();
}
