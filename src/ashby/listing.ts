import type { Page } from "@playwright/test";
import { safePageGoto } from "../security/navigationSafety.js";

export type AshbyListing = {
  title: string;
  company: string | null;
  location: string | null;
  workplaceType: string | null;
  employmentType: string | null;
  department: string | null;
  url: string;
};

export interface AshbyListingBatch {
  listings: AshbyListing[];
  pagesVisited: number;
}

const ASHBY_LISTING_SCRIPT = `(() => {
  const doc = globalThis.document;
  const location = globalThis.location;
  const cleanText = (value) => String(value ?? "").replace(/\\s+/g, " ").trim();
  const absolute = (href) => {
    try {
      return new URL(href, location.href).toString();
    } catch {
      return href;
    }
  };
  const company = cleanText(globalThis.__appData?.organization?.name) || null;

  const rendered = Array.from(doc.querySelectorAll("a[href]"))
    .filter((anchor) => anchor.querySelector(".ashby-job-posting-brief-title"))
    .map((anchor) => {
      const title = cleanText(anchor.querySelector(".ashby-job-posting-brief-title")?.textContent);
      const details = cleanText(anchor.querySelector(".ashby-job-posting-brief-details")?.textContent);
      if (!title) {
        return null;
      }
      const detailParts = details.split(/•|â€¢/).map(cleanText).filter(Boolean);
      return {
        title,
        company,
        department: detailParts[0] ?? null,
        location: detailParts[1] ?? null,
        employmentType: detailParts[2] ?? null,
        workplaceType: detailParts[3] ?? null,
        url: absolute(anchor.href || anchor.getAttribute("href") || ""),
      };
    })
    .filter(Boolean);

  if (rendered.length > 0) {
    return rendered;
  }

  const appData = globalThis.__appData;
  const slug = cleanText(appData?.organization?.hostedJobsPageSlug) || cleanText(location.pathname.split("/")[1]);
  return (appData?.jobBoard?.jobPostings ?? [])
    .map((posting) => ({
      title: cleanText(posting.title),
      company,
      department: cleanText(posting.departmentExternalName || posting.departmentName) || null,
      location: [
        cleanText(posting.locationExternalName || posting.locationName),
        ...(posting.secondaryLocationNames ?? []).map(cleanText),
      ].filter(Boolean).join("; ") || null,
      employmentType: cleanText(posting.employmentType) || null,
      workplaceType: cleanText(posting.workplaceType) || null,
      url: absolute(\`/\${slug}/\${posting.id ?? ""}\${location.search}\`),
    }))
    .filter((listing) => listing.title && /[0-9a-f-]{20,}/i.test(listing.url));
})()`;

function normalizeUrl(url: string, baseUrl: string): string {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

function normalizeListing(listing: AshbyListing): AshbyListing {
  return {
    ...listing,
    title: listing.title.trim(),
    company: listing.company?.trim() || null,
    location: listing.location?.replace(/\s+/g, " ").trim() || null,
    workplaceType: listing.workplaceType?.replace(/\s+/g, " ").trim() || null,
    employmentType: listing.employmentType?.replace(/\s+/g, " ").trim() || null,
    department: listing.department?.replace(/\s+/g, " ").trim() || null,
    url: normalizeUrl(listing.url, listing.url),
  };
}

export function isAshbyListingUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return /(^|\.)jobs\.ashbyhq\.com$/i.test(parsed.hostname) && /^\/[^/]+\/?$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function isAshbyJobDetailUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      /(^|\.)jobs\.ashbyhq\.com$/i.test(parsed.hostname) &&
      /^\/[^/]+\/[0-9a-f-]{20,}(?:\/application)?\/?$/i.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

export async function extractAshbyListings(page: Page, url: string): Promise<AshbyListing[]> {
  await safePageGoto(page, url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2_000);

  const listings = await page.evaluate(ASHBY_LISTING_SCRIPT) as AshbyListing[];

  const uniqueListings = new Map<string, AshbyListing>();
  for (const listing of listings) {
    const normalized = normalizeListing({
      ...listing,
      url: normalizeUrl(listing.url, url),
    });
    if (normalized.title && !uniqueListings.has(normalized.url)) {
      uniqueListings.set(normalized.url, normalized);
    }
  }

  return [...uniqueListings.values()];
}

export async function extractAshbyListingsBatch(
  page: Page,
  url: string,
  count: number,
): Promise<AshbyListingBatch> {
  const listings = await extractAshbyListings(page, url);
  return {
    listings: listings.slice(0, count),
    pagesVisited: 1,
  };
}
