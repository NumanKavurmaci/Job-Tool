import { describe, expect, it, vi } from "vitest";
import {
  extractReactJobsListingsBatch,
  isReactJobsDetailUrl,
  isReactJobsListingUrl,
  type ReactJobsListing,
} from "../../src/reactjobs/listing.js";

const jobOne: ReactJobsListing = {
  url: "https://reactjobs.io/react-jobs/acme/100-role-one",
  title: "React Engineer",
  company: "Acme",
  location: "Remote",
  employmentType: "Full-time",
  posted: "1d",
};

const jobTwo: ReactJobsListing = {
  url: "https://reactjobs.io/react-jobs/beta/200-role-two",
  title: "Frontend Engineer",
  company: "Beta",
  location: "Berlin",
  employmentType: "Contract",
  posted: "2d",
};

function paginator(options: {
  pages: ReactJobsListing[][];
  nextCount?: number;
  disabled?: boolean;
  currentPage?: number | null;
  waitForFunctionRejects?: boolean;
}) {
  let pageIndex = 0;
  let currentPage = options.currentPage ?? null;
  const click = vi.fn(async () => {
    pageIndex = Math.min(pageIndex + 1, options.pages.length - 1);
    if (currentPage != null) currentPage += 1;
  });
  const nextButton = {
    count: vi.fn(async () => options.nextCount ?? 1),
    isDisabled: vi.fn(async () => options.disabled ?? false),
    click,
  };
  const page = {
    goto: vi.fn().mockResolvedValue(null),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    waitForFunction: options.waitForFunctionRejects
      ? vi.fn().mockRejectedValue(new Error("pagination did not advance"))
      : vi.fn().mockResolvedValue(true),
    evaluate: vi.fn(async (script: string | (() => number | null)) => {
      if (typeof script !== "string") return currentPage;
      return options.pages[pageIndex] ?? [];
    }),
    locator: vi.fn(() => ({ first: () => nextButton })),
  };

  return { page, nextButton, click };
}

describe("ReactJobs listing edge cases", () => {
  it.each([
    "https://reactjobs.io./jobs",
    "https://www.reactjobs.io/jobs/",
    "https://eu.reactjobs.io/jobs/frontend",
  ])("accepts a canonical listing host and path: %s", (url) => {
    expect(isReactJobsListingUrl(url)).toBe(true);
  });

  it.each([
    "https://reactjobs.io/job/frontend",
    "https://reactjobs.io/jobs-archive/frontend",
    "file:///jobs/frontend",
    "not-a-url",
  ])("rejects a malformed or unsafe listing URL: %s", (url) => {
    expect(isReactJobsListingUrl(url)).toBe(false);
  });

  it.each([
    "https://reactjobs.io/react-jobs/acme/no-numeric-prefix",
    "https://reactjobs.io/react-jobs/acme/123-role/extra",
    "https://reactjobs.io/react-jobs//123-role",
    "javascript:alert(1)",
  ])("rejects a malformed detail URL: %s", (url) => {
    expect(isReactJobsDetailUrl(url)).toBe(false);
  });

  it("does not inspect the page when the requested target is zero", async () => {
    const { page } = paginator({ pages: [[jobOne]] });

    await expect(
      extractReactJobsListingsBatch(page as never, "https://reactjobs.io/jobs", 0),
    ).resolves.toEqual({ listings: [], pagesVisited: 0 });
    expect(page.evaluate).not.toHaveBeenCalled();
    expect(page.locator).not.toHaveBeenCalled();
  });

  it("normalizes optional fields and stops when no next button exists", async () => {
    const incomplete = {
      url: jobOne.url,
      title: jobOne.title,
      company: undefined,
      location: undefined,
      employmentType: undefined,
      posted: undefined,
    } as unknown as ReactJobsListing;
    const { page, click } = paginator({ pages: [[incomplete]], nextCount: 0 });

    await expect(
      extractReactJobsListingsBatch(page as never, "https://reactjobs.io/jobs", 5),
    ).resolves.toEqual({
      listings: [{
        url: jobOne.url,
        title: jobOne.title,
        company: null,
        location: null,
        employmentType: null,
        posted: null,
      }],
      pagesVisited: 1,
    });
    expect(click).not.toHaveBeenCalled();
  });

  it("does not click a disabled next button", async () => {
    const { page, click } = paginator({ pages: [[jobOne]], disabled: true });

    const result = await extractReactJobsListingsBatch(
      page as never,
      "https://reactjobs.io/jobs",
      2,
    );

    expect(result.pagesVisited).toBe(1);
    expect(click).not.toHaveBeenCalled();
  });

  it("deduplicates listing URLs and stops when a page adds no new jobs", async () => {
    const { page, click } = paginator({ pages: [[jobOne], [jobOne], [jobOne, jobTwo]] });

    const result = await extractReactJobsListingsBatch(
      page as never,
      "https://reactjobs.io/jobs",
      2,
    );

    expect(result).toEqual({ listings: [jobOne], pagesVisited: 2 });
    expect(click).toHaveBeenCalledOnce();
  });

  it("stops safely when the visible page number does not advance", async () => {
    const { page, click } = paginator({
      pages: [[jobOne], [jobOne, jobTwo]],
      currentPage: 1,
      waitForFunctionRejects: true,
    });

    const result = await extractReactJobsListingsBatch(
      page as never,
      "https://reactjobs.io/jobs",
      2,
    );

    expect(result).toEqual({ listings: [jobOne], pagesVisited: 1 });
    expect(click).toHaveBeenCalledOnce();
    expect(page.waitForFunction).toHaveBeenCalledWith(
      expect.any(Function),
      1,
      { timeout: 15_000 },
    );
  });

  it("truncates the final page at the exact requested count", async () => {
    const { page, click } = paginator({ pages: [[jobOne, jobTwo]] });

    const result = await extractReactJobsListingsBatch(
      page as never,
      "https://reactjobs.io/jobs",
      1,
    );

    expect(result).toEqual({ listings: [jobOne], pagesVisited: 1 });
    expect(click).not.toHaveBeenCalled();
  });
});
