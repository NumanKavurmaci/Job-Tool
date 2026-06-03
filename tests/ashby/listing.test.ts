import { chromium, type Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  extractAshbyListings,
  extractAshbyListingsBatch,
  isAshbyJobDetailUrl,
  isAshbyListingUrl,
} from "../../src/ashby/listing.js";

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser.close();
});

describe("Ashby listing extraction", () => {
  it("recognizes Ashby listing and detail url shapes", () => {
    expect(isAshbyListingUrl("https://jobs.ashbyhq.com/ruby-labs?workplaceType=Remote")).toBe(true);
    expect(
      isAshbyJobDetailUrl("https://jobs.ashbyhq.com/ruby-labs/05254f35-7380-4e94-b780-91bde2469db9"),
    ).toBe(true);
    expect(isAshbyListingUrl("https://jobs.ashbyhq.com/ruby-labs/05254f35-7380-4e94-b780-91bde2469db9")).toBe(false);
    expect(isAshbyListingUrl("not a valid url")).toBe(false);
    expect(isAshbyJobDetailUrl("not a valid url")).toBe(false);
  });

  it("extracts rendered Ashby job cards", async () => {
    const page = await browser.newPage();
    await page.route("https://jobs.ashbyhq.com/ruby-labs?workplaceType=Remote", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `
          <main>
            <a class="_container_j2da7_1" href="/ruby-labs/19d7a5d4-4938-4b4e-80d6-42d475c72393?workplaceType=Remote">
              <h3 class="ashby-job-posting-brief-title">AI Engineer</h3>
              <div class="ashby-job-posting-brief-details">Engineering • Turkey • Full time • Remote</div>
            </a>
            <a class="_container_j2da7_1" href="/ruby-labs/4f62187d-77ae-474b-97d0-cafaef757e9b?workplaceType=Remote">
              <h3 class="ashby-job-posting-brief-title">Senior Backend Engineer</h3>
              <div class="ashby-job-posting-brief-details">Engineering • European Union; Turkey • Full time • Remote</div>
            </a>
            <script>
              window.__appData = { organization: { name: "Ruby Labs" } };
            </script>
          </main>
        `,
      });
    });

    const listings = await extractAshbyListings(
      page,
      "https://jobs.ashbyhq.com/ruby-labs?workplaceType=Remote",
    );

    expect(listings).toEqual([
      {
        title: "AI Engineer",
        company: "Ruby Labs",
        department: "Engineering",
        location: "Turkey",
        employmentType: "Full time",
        workplaceType: "Remote",
        url: "https://jobs.ashbyhq.com/ruby-labs/19d7a5d4-4938-4b4e-80d6-42d475c72393?workplaceType=Remote",
      },
      expect.objectContaining({
        title: "Senior Backend Engineer",
        url: "https://jobs.ashbyhq.com/ruby-labs/4f62187d-77ae-474b-97d0-cafaef757e9b?workplaceType=Remote",
      }),
    ]);

    await page.close();
  });

  it("returns a one-page Ashby listing batch", async () => {
    const page = await browser.newPage();
    await page.route("https://jobs.ashbyhq.com/acme", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `
          <script>
            window.__appData = {
              organization: { name: "Acme", hostedJobsPageSlug: "acme" },
              jobBoard: {
                jobPostings: [
                  {
                    id: "19d7a5d4-4938-4b4e-80d6-42d475c72393",
                    title: "Frontend Engineer",
                    departmentName: "Engineering",
                    locationName: "Turkey",
                    workplaceType: "Remote",
                    employmentType: "FullTime"
                  }
                ]
              }
            };
          </script>
        `,
      });
    });

    const result = await extractAshbyListingsBatch(page, "https://jobs.ashbyhq.com/acme", 1);

    expect(result).toEqual({
      pagesVisited: 1,
      listings: [
        expect.objectContaining({
          title: "Frontend Engineer",
          url: "https://jobs.ashbyhq.com/acme/19d7a5d4-4938-4b4e-80d6-42d475c72393",
        }),
      ],
    });

    await page.close();
  });

  it("normalizes sparse Ashby listings and removes duplicates", async () => {
    const page = {
      goto: async () => undefined,
      waitForTimeout: async () => undefined,
      evaluate: async () => [
        {
          title: "  Backend Engineer  ",
          company: "   ",
          department: null,
          location: null,
          employmentType: null,
          workplaceType: null,
          url: "/acme/19d7a5d4-4938-4b4e-80d6-42d475c72393",
        },
        {
          title: "Backend Engineer",
          company: "Acme",
          department: "Engineering",
          location: "Remote",
          employmentType: "FullTime",
          workplaceType: "Remote",
          url: "/acme/19d7a5d4-4938-4b4e-80d6-42d475c72393",
        },
        {
          title: "   ",
          company: "Acme",
          department: "Engineering",
          location: "Remote",
          employmentType: "FullTime",
          workplaceType: "Remote",
          url: "/acme/4f62187d-77ae-474b-97d0-cafaef757e9b",
        },
      ],
    };

    const listings = await extractAshbyListings(page as never, "https://jobs.ashbyhq.com/acme");

    expect(listings).toEqual([
      {
        title: "Backend Engineer",
        company: null,
        department: null,
        location: null,
        employmentType: null,
        workplaceType: null,
        url: "https://jobs.ashbyhq.com/acme/19d7a5d4-4938-4b4e-80d6-42d475c72393",
      },
    ]);
  });
});
