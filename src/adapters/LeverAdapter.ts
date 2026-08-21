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

export class LeverAdapter implements JobAdapter {
  name = "lever";

  canHandle(url: string): boolean {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return hostname === "lever.co" || hostname.endsWith(".lever.co");
    } catch {
      return false;
    }
  }

  async extract(page: Page, url: string): Promise<ExtractedJobContent> {
    await gotoJobPage(page, url);
    const currentUrl = await getCurrentUrl(page);
    const structured = await extractJobPostingStructuredData(page);

    const title =
      (await getTextBySelectors(page, [
        ".posting-headline h2",
        ".posting-headline h1",
        ".posting-headline",
        "h1",
      ])) ?? structured?.title ??
      (await getAttributeBySelectors(page, ["meta[property='og:title']", "meta[name='twitter:title']"], "content")) ??
      optionalText(await page.title());

    const company =
      (await getTextBySelectors(page, [".main-header-text", ".posting-categories + div"])) ??
      structured?.company ??
      (await getAttributeBySelectors(page, ["meta[property='og:site_name']"], "content"));

    const location =
      (await getTextBySelectors(page, [
        ".posting-categories .location",
        ".posting-categories [class*='location']",
        "[data-qa='posting-location']",
      ])) ?? structured?.location ?? null;

    const rawApplyUrl =
      (await getAttributeBySelectors(
        page,
        ["a[href*='/apply']", "a[href*='jobs.lever.co']"],
        "href",
      )) ?? structured?.canonicalUrl ?? currentUrl;
    const applyUrl = resolveHttpUrl(rawApplyUrl, currentUrl) ?? currentUrl;

    const descriptionText =
      (await extractSectionText(page, [".posting-page", ".posting", "main"])) ??
      structured?.descriptionText ?? null;

    const requirementsText =
      (await extractSectionText(page, [
        ".posting-requirements",
        "[class*='requirement']",
        "[class*='qualification']",
      ])) ?? structured?.requirementsText ?? null;

    const benefitsText =
      (await extractSectionText(page, [
        ".posting-benefits",
        "[class*='benefit']",
        "[class*='perk']",
      ])) ?? structured?.benefitsText ?? null;

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
      applicationType: "external",
      rawWorkplaceType: normalizeStructuredWorkplaceType(structured?.workplaceType),
      applyUrl,
      currentUrl,
      descriptionText,
      requirementsText,
      benefitsText,
    };
  }
}
