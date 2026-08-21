import type { Page } from "@playwright/test";
import {
  assertSafeNavigationUrl,
  safePageGoto,
} from "../security/navigationSafety.js";

export type KariyerListing = {
  jobId: string;
  url: string;
  title: string;
  company: string | null;
  location: string | null;
  workplaceType: string | null;
  badges: string[];
  posted: string | null;
};

export interface KariyerListingBatch {
  listings: KariyerListing[];
  pagesVisited: number;
}

type RawKariyerListing = {
  href: string;
  title: string;
  company: string | null;
  location: string | null;
  workplaceType: string | null;
  badges: string[];
  posted: string | null;
};

const KARIYER_CARD_SELECTOR = "a[data-test='ad-card-item'][href^='/is-ilani/']";
const KARIYER_NEXT_PAGE_SELECTOR =
  "nav[aria-label='Pagination'] a[aria-label='Go to next page']";
const KARIYER_LISTING_HYDRATION_ATTEMPTS = 12;
const KARIYER_LISTING_HYDRATION_INTERVAL_MS = 500;

const KARIYER_LISTING_SCRIPT = `(() => {
  const clean = (value) => String(value ?? "").replace(/\\s+/g, " ").trim();
  const optionalText = (root, selector) => clean(root.querySelector(selector)?.textContent) || null;

  return Array.from(document.querySelectorAll("${KARIYER_CARD_SELECTOR}"))
    .map((card) => ({
      href: card.getAttribute("href") ?? "",
      title: optionalText(card, "[data-test='ad-card-title']") ?? "",
      company: optionalText(card, "[data-test='subtitle']"),
      location: optionalText(card, "[data-test='location']"),
      workplaceType: optionalText(card, "[data-test='work-model']"),
      badges: Array.from(card.querySelectorAll("[data-test='mapped-badges']"))
        .map((badge) => clean(badge.textContent))
        .filter(Boolean),
      posted: optionalText(card, "[data-test='ad-date-item-date-other']"),
    }))
    .filter((listing) => listing.href && listing.title);
})()`;

function isKariyerHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return normalized === "kariyer.net" || normalized === "www.kariyer.net";
}

function decodePathname(pathname: string): string | null {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
}

function parseKariyerListingUrl(input: string): URL | null {
  try {
    const parsed = assertSafeNavigationUrl(input, {
      requireHttps: true,
      allowedHostname: isKariyerHostname,
      context: "Kariyer.net listing URL",
    });
    const pathname = decodePathname(parsed.pathname);
    if (
      parsed.port ||
      !pathname ||
      !/^\/is-ilanlari(?:\/[a-z0-9çğıöşü+_-]+)?\/?$/iu.test(pathname)
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function parseKariyerJobUrl(input: string, baseUrl: string): {
  jobId: string;
  url: string;
} | null {
  try {
    const resolved = new URL(input, baseUrl).toString();
    const parsed = assertSafeNavigationUrl(resolved, {
      requireHttps: true,
      allowedHostname: isKariyerHostname,
      context: "Kariyer.net job URL",
    });
    const pathname = decodePathname(parsed.pathname);
    const match = pathname?.match(/^\/is-ilani\/[a-z0-9çğıöşü-]+-(\d+)\/?$/iu);
    if (parsed.port || !match?.[1]) {
      return null;
    }

    return {
      jobId: match[1],
      url: `https://www.kariyer.net${parsed.pathname.replace(/\/+$/, "")}`,
    };
  } catch {
    return null;
  }
}

export function isKariyerListingUrl(url: string): boolean {
  return parseKariyerListingUrl(url) !== null;
}

export function isKariyerJobDetailUrl(url: string): boolean {
  return parseKariyerJobUrl(url, url) !== null;
}

function cleanText(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized || null;
}

function normalizeListing(
  listing: RawKariyerListing,
  baseUrl: string,
): KariyerListing | null {
  const job = parseKariyerJobUrl(listing.href, baseUrl);
  const title = cleanText(listing.title);
  if (!job || !title) {
    return null;
  }

  return {
    jobId: job.jobId,
    url: job.url,
    title,
    company: cleanText(listing.company),
    location: cleanText(listing.location),
    workplaceType: cleanText(listing.workplaceType),
    badges: [
      ...new Set(
        listing.badges
          .map((badge) => cleanText(badge))
          .filter((badge): badge is string => Boolean(badge)),
      ),
    ],
    posted: cleanText(listing.posted),
  };
}

function mergeListing(
  existing: KariyerListing,
  incoming: KariyerListing,
): KariyerListing {
  return {
    ...existing,
    company: existing.company ?? incoming.company,
    location: existing.location ?? incoming.location,
    workplaceType: existing.workplaceType ?? incoming.workplaceType,
    badges: [...new Set([...existing.badges, ...incoming.badges])],
    posted: existing.posted ?? incoming.posted,
  };
}

async function navigateToKariyerListing(page: Page, url: string): Promise<string> {
  const parsed = parseKariyerListingUrl(url);
  if (!parsed) {
    throw new Error("Expected a canonical HTTPS Kariyer.net listing URL.");
  }

  await safePageGoto(
    page,
    parsed.toString(),
    { waitUntil: "domcontentloaded", timeout: 60_000 },
    {
      requireHttps: true,
      allowedHostname: isKariyerHostname,
      context: "Kariyer.net listing navigation",
    },
  );
  const cardLocator = typeof (page as Page & { locator?: unknown }).locator === "function"
    ? page.locator(KARIYER_CARD_SELECTOR)
    : null;
  if (cardLocator && typeof (cardLocator as { count?: unknown }).count === "function") {
    for (
      let attempt = 0;
      attempt < KARIYER_LISTING_HYDRATION_ATTEMPTS;
      attempt += 1
    ) {
      if ((await cardLocator.count().catch(() => 0)) > 0) {
        break;
      }
      if (attempt < KARIYER_LISTING_HYDRATION_ATTEMPTS - 1) {
        await page.waitForTimeout(KARIYER_LISTING_HYDRATION_INTERVAL_MS);
      }
    }
  } else {
    await page.waitForTimeout(1_000);
  }

  const currentUrl = typeof page.url === "function" ? page.url() : parsed.toString();
  const finalUrl = parseKariyerListingUrl(currentUrl);
  if (!finalUrl) {
    throw new Error("Kariyer.net listing navigation left the expected listing route.");
  }

  return finalUrl.toString();
}

async function readCurrentListings(
  page: Page,
  pageUrl: string,
): Promise<KariyerListing[]> {
  const rawListings = await page.evaluate(KARIYER_LISTING_SCRIPT) as RawKariyerListing[];
  const listings = new Map<string, KariyerListing>();

  for (const rawListing of rawListings) {
    const listing = normalizeListing(rawListing, pageUrl);
    if (!listing) {
      continue;
    }

    const existing = listings.get(listing.jobId);
    listings.set(
      listing.jobId,
      existing ? mergeListing(existing, listing) : listing,
    );
  }

  return [...listings.values()];
}

function sameSearchParamValues(left: URL, right: URL, name: string): boolean {
  const leftValues = left.searchParams.getAll(name).sort();
  const rightValues = right.searchParams.getAll(name).sort();
  return (
    leftValues.length === rightValues.length &&
    leftValues.every((value, index) => value === rightValues[index])
  );
}

function readPageNumber(url: URL, fallback?: number): number | null {
  const rawValue = url.searchParams.get("cp");
  if (rawValue == null) {
    return fallback ?? null;
  }
  if (!/^[1-9]\d*$/.test(rawValue)) {
    return null;
  }

  const pageNumber = Number(rawValue);
  return Number.isSafeInteger(pageNumber) ? pageNumber : null;
}

async function resolveNextKariyerListingUrl(
  page: Page,
  currentUrl: string,
): Promise<string | null> {
  const nextLink = page.locator(KARIYER_NEXT_PAGE_SELECTOR).first();
  if ((await nextLink.count().catch(() => 0)) === 0) {
    return null;
  }

  const ariaDisabled = await nextLink.getAttribute("aria-disabled").catch(() => null);
  if (ariaDisabled === "true") {
    return null;
  }

  const href = (await nextLink.getAttribute("href").catch(() => null))?.trim();
  if (!href || href.startsWith("//") || (!href.startsWith("/") && !href.startsWith("?"))) {
    return null;
  }

  const current = parseKariyerListingUrl(currentUrl);
  const next = parseKariyerListingUrl(new URL(href, currentUrl).toString());
  if (!current || !next || next.pathname !== current.pathname) {
    return null;
  }

  const currentPage = readPageNumber(current, 1);
  const nextPage = readPageNumber(next);
  if (currentPage == null || nextPage == null || nextPage <= currentPage) {
    return null;
  }

  const searchParamNames = new Set([
    ...current.searchParams.keys(),
    ...next.searchParams.keys(),
  ]);
  for (const key of searchParamNames) {
    if (key !== "cp" && !sameSearchParamValues(current, next, key)) {
      return null;
    }
  }

  return next.toString();
}

export async function extractKariyerListings(
  page: Page,
  url: string,
): Promise<KariyerListing[]> {
  const currentUrl = await navigateToKariyerListing(page, url);
  return readCurrentListings(page, currentUrl);
}

export async function extractKariyerListingsBatch(
  page: Page,
  url: string,
  targetCount: number,
): Promise<KariyerListingBatch> {
  const requestedCount = Number.isFinite(targetCount)
    ? Math.max(1, Math.floor(targetCount))
    : 1;
  const listings = new Map<string, KariyerListing>();
  const visitedPages = new Set<string>();
  let currentUrl = await navigateToKariyerListing(page, url);
  let pagesVisited = 0;

  while (!visitedPages.has(currentUrl) && listings.size < requestedCount) {
    visitedPages.add(currentUrl);
    const currentListings = await readCurrentListings(page, currentUrl);
    for (const listing of currentListings) {
      const existing = listings.get(listing.jobId);
      listings.set(
        listing.jobId,
        existing ? mergeListing(existing, listing) : listing,
      );
      if (listings.size >= requestedCount) {
        break;
      }
    }
    pagesVisited += 1;

    if (listings.size >= requestedCount) {
      break;
    }

    const nextUrl = await resolveNextKariyerListingUrl(page, currentUrl);
    if (!nextUrl || visitedPages.has(nextUrl)) {
      break;
    }
    currentUrl = await navigateToKariyerListing(page, nextUrl);
  }

  return {
    listings: [...listings.values()].slice(0, requestedCount),
    pagesVisited,
  };
}
