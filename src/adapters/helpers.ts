import type { Page } from "@playwright/test";

function normalizeWhitespace(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return normalized || null;
}

export function compactText(value: string | null | undefined): string {
  return normalizeWhitespace(value) ?? "";
}

export function optionalText(value: string | null | undefined): string | null {
  return normalizeWhitespace(value);
}

export async function getTextBySelectors(
  page: Page,
  selectors: string[],
): Promise<string | null> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) === 0) {
      continue;
    }

    const text = optionalText(await locator.innerText().catch(() => null));
    if (text) {
      return text;
    }
  }

  return null;
}

export async function getAttributeBySelectors(
  page: Page,
  selectors: string[],
  attribute: string,
): Promise<string | null> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) === 0) {
      continue;
    }

    const value = optionalText(
      await locator.getAttribute(attribute).catch(() => null),
    );

    if (value) {
      return value;
    }
  }

  return null;
}

export async function extractSectionText(
  page: Page,
  selectors: string[],
): Promise<string | null> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) === 0) {
      continue;
    }

    const text = optionalText(await locator.innerText().catch(() => null));
    if (text) {
      return text;
    }
  }

  return null;
}

export async function extractBodyText(page: Page): Promise<string> {
  const text = await page.locator("body").innerText();
  return compactText(text);
}

export async function getCurrentUrl(page: Page): Promise<string> {
  return page.url();
}

export async function gotoJobPage(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2_000);
}
