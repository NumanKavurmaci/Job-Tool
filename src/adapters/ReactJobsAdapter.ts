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
import { isReactJobsDetailUrl } from "../reactjobs/listing.js";

export class ReactJobsAdapter implements JobAdapter {
  name = "reactjobs";

  canHandle(url: string): boolean {
    return isReactJobsDetailUrl(url);
  }

  async extract(page: Page, url: string): Promise<ExtractedJobContent> {
    await gotoJobPage(page, url);

    const title =
      (await getTextBySelectors(page, ["main h1", "h1"])) ??
      optionalText(await page.title());
    const company = await getTextBySelectors(page, [
      "aside a[href*='/companies/']",
      "a[href*='/companies/']",
    ]);
    const location = await getTextBySelectors(page, [
      "dt:has-text('Location') + dd",
      "aside [class*='location']",
    ]);
    const applyUrl =
      (await getAttributeBySelectors(
        page,
        [
          "a[href*='apply.workable.com']",
          "a[href*='jobs.ashbyhq.com']",
          "a[href*='/apply/']",
          "a[href*='apply']",
          "a:has-text('Apply now')",
        ],
        "href",
      )) ?? (await getCurrentUrl(page));

    return {
      rawText: await extractBodyText(page),
      title,
      company,
      companyLogoUrl: await getAttributeBySelectors(page, ["img[alt]"], "src"),
      companyLinkedinUrl: null,
      location,
      platform: this.name,
      applicationType: "external",
      applyUrl,
      currentUrl: await getCurrentUrl(page),
      descriptionText: await extractSectionText(page, ["main"]),
      requirementsText: await extractSectionText(page, [
        "main [class*='requirement']",
        "main",
      ]),
      benefitsText: await extractSectionText(page, [
        "main [class*='benefit']",
        "main [class*='perk']",
      ]),
    };
  }
}
