import type { Page } from "@playwright/test";
import {
  assertSafeNavigationUrl,
  safePageGoto,
} from "../security/navigationSafety.js";

export type ReactJobsListing = {
  url: string;
  title: string;
  company: string | null;
  location: string | null;
  employmentType: string | null;
  posted: string | null;
};

export interface ReactJobsListingBatch {
  listings: ReactJobsListing[];
  pagesVisited: number;
}

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
  try {
    const parsed = assertSafeNavigationUrl(url, { context: "ReactJobs listing URL" });
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
    return (
      (hostname === "reactjobs.io" || hostname.endsWith(".reactjobs.io")) &&
      /^\/jobs(?:\/|$)/i.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

export function isReactJobsDetailUrl(url: string): boolean {
  try {
    const parsed = assertSafeNavigationUrl(url, { context: "ReactJobs detail URL" });
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
    return (
      (hostname === "reactjobs.io" || hostname.endsWith(".reactjobs.io")) &&
      /^\/react-jobs\/[^/]+\/\d+-[^/]+\/?$/i.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

export async function extractReactJobsListings(page: Page, url: string): Promise<ReactJobsListing[]> {
  await safePageGoto(page, url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(1_000);
  return page.evaluate(REACTJOBS_LISTING_SCRIPT);
}

function normalizeReactJobsListing(listing: ReactJobsListing): ReactJobsListing {
  return {
    url: listing.url,
    title: listing.title,
    company: listing.company ?? null,
    location: listing.location ?? null,
    employmentType: listing.employmentType ?? null,
    posted: listing.posted ?? null,
  };
}

async function readCurrentPageNumber(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const current = (globalThis as any).document?.querySelector?.("[aria-current='page']");
    const text = current?.textContent?.trim() ?? "";
    const parsed = Number.parseInt(text, 10);
    return Number.isFinite(parsed) ? parsed : null;
  });
}

async function goToNextReactJobsResultsPage(page: Page): Promise<boolean> {
  const nextButton = page.locator(
    "button[wire\\:click*='nextPage'], button[dusk='nextPage.before']",
  ).first();

  if ((await nextButton.count()) === 0) {
    return false;
  }

  if (await nextButton.isDisabled().catch(() => false)) {
    return false;
  }

  const previousPageNumber = await readCurrentPageNumber(page);
  await nextButton.click();

  if (previousPageNumber != null) {
    await page.waitForFunction(
      (expectedPage) => {
        const current = (globalThis as any).document?.querySelector?.("[aria-current='page']");
        const text = current?.textContent?.trim() ?? "";
        const parsed = Number.parseInt(text, 10);
        return Number.isFinite(parsed) && parsed > expectedPage;
      },
      previousPageNumber,
      { timeout: 15_000 },
    ).catch(() => undefined);
  }

  await page.waitForTimeout(1_000);
  return true;
}

export async function extractReactJobsListingsBatch(
  page: Page,
  url: string,
  targetCount: number,
): Promise<ReactJobsListingBatch> {
  await safePageGoto(page, url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(1_000);

  const uniqueListings = new Map<string, ReactJobsListing>();
  let pagesVisited = 0;

  while (uniqueListings.size < targetCount) {
    const listings = await page.evaluate(REACTJOBS_LISTING_SCRIPT) as ReactJobsListing[];
    for (const listing of listings) {
      if (!uniqueListings.has(listing.url)) {
        uniqueListings.set(listing.url, normalizeReactJobsListing(listing));
      }

      if (uniqueListings.size >= targetCount) {
        break;
      }
    }

    pagesVisited += 1;
    if (uniqueListings.size >= targetCount) {
      break;
    }

    const advanced = await goToNextReactJobsResultsPage(page);
    if (!advanced) {
      break;
    }
  }

  return {
    listings: Array.from(uniqueListings.values()),
    pagesVisited,
  };
}
