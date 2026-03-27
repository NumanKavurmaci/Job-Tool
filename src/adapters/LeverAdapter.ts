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

export class LeverAdapter implements JobAdapter {
  name = "lever";

  canHandle(url: string): boolean {
    return /jobs\.lever\.co|lever\.co/i.test(url);
  }

  async extract(page: Page, url: string): Promise<ExtractedJobContent> {
    await gotoJobPage(page, url);

    const title =
      (await getTextBySelectors(page, [
        ".posting-headline h2",
        ".posting-headline h1",
        ".posting-headline",
        "h1",
      ])) ?? optionalText(await page.title());

    const company = await getTextBySelectors(page, [
      ".main-header-text",
      ".posting-categories + div",
      "meta[property='og:site_name']",
    ]);

    const location = await getTextBySelectors(page, [
      ".posting-categories .location",
      ".posting-categories [class*='location']",
      "[data-qa='posting-location']",
    ]);

    const applyUrl =
      (await getAttributeBySelectors(
        page,
        ["a[href*='/apply']", "a[href*='jobs.lever.co']"],
        "href",
      )) ?? (await getCurrentUrl(page));

    const descriptionText = await extractSectionText(page, [
      ".posting-page",
      ".posting",
      "main",
    ]);

    const requirementsText = await extractSectionText(page, [
      ".posting-requirements",
      "[class*='requirement']",
      "[class*='qualification']",
    ]);

    const benefitsText = await extractSectionText(page, [
      ".posting-benefits",
      "[class*='benefit']",
      "[class*='perk']",
    ]);

    return {
      rawText: await extractBodyText(page),
      title,
      company,
      location,
      platform: this.name,
      applicationType: "external",
      applyUrl,
      currentUrl: await getCurrentUrl(page),
      descriptionText,
      requirementsText,
      benefitsText,
    };
  }
}
