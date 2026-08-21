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

export class GreenhouseAdapter implements JobAdapter {
  name = "greenhouse";

  canHandle(url: string): boolean {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return hostname === "greenhouse.io" || hostname.endsWith(".greenhouse.io");
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
        "#header .app-title",
        ".job__title",
        "h1.app-title",
        "h1",
      ])) ?? structured?.title ??
      (await getAttributeBySelectors(page, ["meta[property='og:title']", "meta[name='twitter:title']"], "content")) ??
      optionalText(await page.title());

    const company =
      (await getTextBySelectors(page, [
        "#header .company-name",
        ".company-name",
        "[data-testid='company-name']",
      ])) ??
      structured?.company ??
      (await getAttributeBySelectors(page, ["meta[property='og:site_name']"], "content"));

    const location =
      (await getTextBySelectors(page, [
        "#header .location",
        ".location",
        ".job__location",
        "[data-testid='job-location']",
      ])) ?? structured?.location ?? null;

    const rawApplyUrl =
      (await getAttributeBySelectors(
        page,
        ["a[href*='/applications/new']", "a[href*='greenhouse.io']"],
        "href",
      )) ?? structured?.canonicalUrl ?? currentUrl;
    const applyUrl = resolveHttpUrl(rawApplyUrl, currentUrl) ?? currentUrl;

    const descriptionText =
      (await extractSectionText(page, ["#content", ".content", ".job__content", "main"])) ??
      structured?.descriptionText ?? null;

    const requirementsText =
      (await extractSectionText(page, [
        "#content [id*='require']",
        "#content [class*='require']",
        "#content [class*='qualification']",
      ])) ?? structured?.requirementsText ?? null;

    const benefitsText =
      (await extractSectionText(page, [
        "#content [id*='benefit']",
        "#content [class*='benefit']",
        "#content [class*='perk']",
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
