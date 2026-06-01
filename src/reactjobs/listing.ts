import type { Page } from "@playwright/test";

export type ReactJobsListing = {
  url: string;
  title: string;
  company: string | null;
  location: string | null;
  employmentType: string | null;
  posted: string | null;
};

const REACTJOBS_LISTING_SCRIPT = `(() => {
  const clean = (value) => String(value ?? "").replace(/\\s+/g, " ").trim();
  const readDefinition = (container, term) => {
    const terms = Array.from(container.querySelectorAll("dt"));
    const match = terms.find((candidate) => clean(candidate.textContent).toLowerCase() === term);
    return match ? clean(match.nextElementSibling?.textContent) || null : null;
  };

  return Array.from(document.querySelectorAll("main a[href*='/react-jobs/']"))
    .filter((link) => /\\/react-jobs\\/[^/]+\\/\\d+-/.test(link.href))
    .map((link) => {
      const container = link.closest("li, article, dl") ?? link.parentElement?.parentElement;
      return {
        url: link.href,
        title: clean(link.textContent),
        company: container ? readDefinition(container, "company") : null,
        location: container ? readDefinition(container, "location") : null,
        employmentType: container ? readDefinition(container, "employment type") : null,
        posted: container ? readDefinition(container, "posted") : null,
      };
    })
    .filter((job, index, all) => job.title && all.findIndex((candidate) => candidate.url === job.url) === index);
})()`;

export function isReactJobsListingUrl(url: string): boolean {
  return /reactjobs\.io\/jobs(?:\/|$)/i.test(url);
}

export function isReactJobsDetailUrl(url: string): boolean {
  return /reactjobs\.io\/react-jobs\/[^/]+\/\d+-/i.test(url);
}

export async function extractReactJobsListings(page: Page, url: string): Promise<ReactJobsListing[]> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(1_000);
  return page.evaluate(REACTJOBS_LISTING_SCRIPT);
}
