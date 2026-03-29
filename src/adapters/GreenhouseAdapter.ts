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

export class GreenhouseAdapter implements JobAdapter {
  name = "greenhouse";

  canHandle(url: string): boolean {
    return /greenhouse\.io/i.test(url);
  }

  async extract(page: Page, url: string): Promise<ExtractedJobContent> {
    await gotoJobPage(page, url);

    const title =
      (await getTextBySelectors(page, [
        "#header .app-title",
        ".job__title",
        "h1.app-title",
        "h1",
      ])) ?? optionalText(await page.title());

    const company = await getTextBySelectors(page, [
      "#header .company-name",
      ".company-name",
      "[data-testid='company-name']",
      "meta[property='og:site_name']",
    ]);

    const location = await getTextBySelectors(page, [
      "#header .location",
      ".location",
      ".job__location",
      "[data-testid='job-location']",
    ]);

    const applyUrl =
      (await getAttributeBySelectors(
        page,
        ["a[href*='/applications/new']", "a[href*='greenhouse.io']"],
        "href",
      )) ?? (await getCurrentUrl(page));

    const descriptionText = await extractSectionText(page, [
      "#content",
      ".content",
      ".job__content",
      "main",
    ]);

    const requirementsText = await extractSectionText(page, [
      "#content [id*='require']",
      "#content [class*='require']",
      "#content [class*='qualification']",
    ]);

    const benefitsText = await extractSectionText(page, [
      "#content [id*='benefit']",
      "#content [class*='benefit']",
      "#content [class*='perk']",
    ]);

    return {
      rawText: await extractBodyText(page),
      title,
      company,
      companyLogoUrl: null,
      companyLinkedinUrl: null,
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
