import { describe, expect, it, vi } from "vitest";
import {
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
});
