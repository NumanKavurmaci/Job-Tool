import { describe, expect, it, vi } from "vitest";
import {
  extractReactJobsListingsBatch,
  extractReactJobsListings,
  isReactJobsListingUrl,
} from "../../src/reactjobs/listing.js";

describe("ReactJobs listing extraction", () => {
  it("recognizes listing urls", () => {
    expect(isReactJobsListingUrl("https://reactjobs.io/jobs/nextjs/remote?isRemote=true")).toBe(true);
    expect(isReactJobsListingUrl("https://reactjobs.io/react-jobs/robusta/8446-role")).toBe(false);
  });

  it("navigates to the listing and returns the normalized browser extraction", async () => {
    const jobs = [
      {
        url: "https://reactjobs.io/react-jobs/robusta/8446-role",
        title: "Senior Frontend Engineer",
        company: "robusta",
        location: "Remote /",
        employmentType: "Full-time",
        posted: "3w",
      },
    ];
    const page = {
      goto: vi.fn(),
      waitForTimeout: vi.fn(),
      evaluate: vi.fn().mockResolvedValue(jobs),
    };

    await expect(
      extractReactJobsListings(page as never, "https://reactjobs.io/jobs/nextjs/remote"),
    ).resolves.toEqual(jobs);
    expect(page.goto).toHaveBeenCalledWith("https://reactjobs.io/jobs/nextjs/remote", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
  });

  it("keeps advancing ReactJobs pagination until the target listing count is reached", async () => {
    const pageOneJobs = [
      {
        url: "https://reactjobs.io/react-jobs/robusta/8446-role",
        title: "Senior Frontend Engineer",
        company: "robusta",
        location: "Remote /",
        employmentType: "Full-time",
        posted: "3w",
      },
    ];
    const pageTwoJobs = [
      ...pageOneJobs,
      {
        url: "https://reactjobs.io/react-jobs/acme/9000-role",
        title: "Next.js Engineer",
        company: "acme",
        location: "Remote /",
        employmentType: "Full-time",
        posted: "1w",
      },
    ];
    let pageNumber = 1;
    const page = {
      goto: vi.fn(),
      waitForTimeout: vi.fn(),
      waitForFunction: vi.fn(async (fn: (page: number) => boolean, expectedPage: number) => {
        pageNumber = expectedPage + 1;
        return fn(expectedPage);
      }),
      evaluate: vi.fn(async (script: string | (() => number | null)) => {
        if (typeof script !== "string") {
          return pageNumber;
        }

        return pageNumber === 1 ? pageOneJobs : pageTwoJobs;
      }),
      locator: vi.fn(() => ({
        first: () => ({
          count: vi.fn(async () => 1),
          isDisabled: vi.fn(async () => false),
          click: vi.fn(async () => undefined),
        }),
      })),
    };

    await expect(
      extractReactJobsListingsBatch(page as never, "https://reactjobs.io/jobs/nextjs/remote", 2),
    ).resolves.toEqual({
      listings: pageTwoJobs,
      pagesVisited: 2,
    });
  });
});
