import type { Page } from "@playwright/test";
import type { ExtractedJobContent, JobAdapter } from "./types.js";
import {
  extractBodyText,
  extractSectionText,
  getAttributeBySelectors,
  getCurrentUrl,
  getTextBySelectors,
  gotoJobPage,
  optionalText,
} from "./helpers.js";

export class GenericAdapter implements JobAdapter {
  name = "generic";

  canHandle(_url: string): boolean {
    return true;
  }

  async extract(page: Page, url: string): Promise<ExtractedJobContent> {
    await gotoJobPage(page, url);

    const title =
      (await getTextBySelectors(page, [
        "h1",
        "[data-testid='job-title']",
        "[class*='job-title']",
        "meta[property='og:title']",
      ])) ?? optionalText(await page.title());

    const company = await getTextBySelectors(page, [
      "[data-testid='company-name']",
      "[class*='company']",
      "header [class*='company']",
    ]);

    const location = await getTextBySelectors(page, [
      "[data-testid='job-location']",
      "[class*='location']",
      "[class*='job-location']",
    ]);

    const applyUrl =
      (await getAttributeBySelectors(
        page,
        [
          "a[href*='apply']",
          "a[href*='jobs.lever.co']",
          "a[href*='greenhouse.io']",
          "a[data-testid='apply-button']",
        ],
        "href",
      )) ?? (await getCurrentUrl(page));

    const descriptionText = await extractSectionText(page, [
      "main",
      "article",
      "[role='main']",
      "body",
    ]);

    const requirementsText = await extractSectionText(page, [
      "[data-testid='requirements']",
      "[class*='requirement']",
      "[class*='qualification']",
    ]);

    const benefitsText = await extractSectionText(page, [
      "[data-testid='benefits']",
      "[class*='benefit']",
      "[class*='perk']",
    ]);

    return {
      rawText: await extractBodyText(page),
      title,
      company,
      location,
      platform: this.name,
      applicationType: "unknown",
      applyUrl,
      currentUrl: await getCurrentUrl(page),
      descriptionText,
      requirementsText,
      benefitsText,
    };
  }
}
