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
import {
  extractJobPostingStructuredData,
  normalizeStructuredWorkplaceType,
  resolveHttpUrl,
} from "./structuredData.js";

export class GenericAdapter implements JobAdapter {
  name = "generic";

  canHandle(_url: string): boolean {
    return true;
  }

  async extract(page: Page, url: string): Promise<ExtractedJobContent> {
    await gotoJobPage(page, url);
    const currentUrl = await getCurrentUrl(page);
    const structured = await extractJobPostingStructuredData(page);

    const title =
      structured?.title ??
      (await getTextBySelectors(page, [
        "h1",
        "[data-testid='job-title']",
        "[class*='job-title']",
      ])) ??
      (await getAttributeBySelectors(page, ["meta[property='og:title']", "meta[name='twitter:title']"], "content")) ??
      optionalText(await page.title());

    const company =
      structured?.company ??
      (await getTextBySelectors(page, [
        "[data-testid='company-name']",
        "[class*='company']",
        "header [class*='company']",
      ])) ??
      (await getAttributeBySelectors(page, ["meta[property='og:site_name']"], "content"));

    const location =
      structured?.location ??
      (await getTextBySelectors(page, [
        "[data-testid='job-location']",
        "[class*='job-location']",
        "[class*='location']",
      ]));

    const rawApplyUrl =
      (await getAttributeBySelectors(
        page,
        [
          "a[href*='apply']",
          "a[href*='jobs.lever.co']",
          "a[href*='greenhouse.io']",
          "a[data-testid='apply-button']",
        ],
        "href",
      )) ?? structured?.canonicalUrl ?? currentUrl;
    const applyUrl = resolveHttpUrl(rawApplyUrl, currentUrl) ?? currentUrl;

    const descriptionText =
      structured?.descriptionText ??
      (await extractSectionText(page, ["main", "article", "[role='main']", "body"]));

    const requirementsText =
      structured?.requirementsText ??
      (await extractSectionText(page, [
        "[data-testid='requirements']",
        "[class*='requirement']",
        "[class*='qualification']",
      ]));

    const benefitsText =
      structured?.benefitsText ??
      (await extractSectionText(page, [
        "[data-testid='benefits']",
        "[class*='benefit']",
        "[class*='perk']",
      ]));

    return {
      rawText: await extractBodyText(page),
      title,
      company,
      companyLogoUrl:
        structured?.companyLogoUrl ??
        (await getAttributeBySelectors(page, ["meta[property='og:image']"], "content")),
      companyLinkedinUrl: null,
      location,
      platform: this.name,
      applicationType: "unknown",
      rawWorkplaceType: normalizeStructuredWorkplaceType(structured?.workplaceType),
      applyUrl,
      currentUrl,
      descriptionText,
      requirementsText,
      benefitsText,
    };
  }
}
