import { describe, expect, it, vi } from "vitest";
import {
  extractKariyerListings,
  extractKariyerListingsBatch,
  isKariyerJobDetailUrl,
  isKariyerListingUrl,
} from "../../src/kariyer/listing.js";

const listingUrl =
  "https://www.kariyer.net/is-ilanlari/yazilim+gelistirme+uzmani?pst=3193&pkw=yaz%C4%B1l%C4%B1m%20geli%C5%9Ftirme%20uzman%C4%B1";

function rawListing(overrides: Record<string, unknown> = {}) {
  return {
    href: "/is-ilani/acme-yazilim-gelistirme-uzmani-4512345?ref=search",
    title: " Yazılım Geliştirme Uzmanı ",
    company: " Acme Teknoloji ",
    location: " İstanbul (Avr.) ",
    workplaceType: " Hibrit ",
    badges: [" Tam Zamanlı ", "Hibrit", "Hibrit"],
    posted: " 2 gün önce ",
    ...overrides,
  };
}

describe("Kariyer.net listing extraction", () => {
  it("recognizes only strict HTTPS Kariyer.net listing and detail URL shapes", () => {
    expect(isKariyerListingUrl(listingUrl)).toBe(true);
    expect(isKariyerListingUrl("https://kariyer.net/is-ilanlari/yazilim+uzmani?cp=2")).toBe(true);
    expect(isKariyerListingUrl("https://www.kariyer.net/is-ilanlari")).toBe(true);
    expect(isKariyerListingUrl("http://www.kariyer.net/is-ilanlari/yazilim+uzmani")).toBe(false);
    expect(isKariyerListingUrl("https://user:secret@www.kariyer.net/is-ilanlari/yazilim+uzmani")).toBe(false);
    expect(isKariyerListingUrl("https://kariyer.net.evil.test/is-ilanlari/yazilim+uzmani")).toBe(false);
    expect(isKariyerListingUrl("https://www.kariyer.net/is-ilani/acme-role-4512345")).toBe(false);

    expect(isKariyerJobDetailUrl("https://www.kariyer.net/is-ilani/acme-role-4512345?ref=search")).toBe(true);
    expect(isKariyerJobDetailUrl("https://evil.test/is-ilani/acme-role-4512345")).toBe(false);
    expect(isKariyerJobDetailUrl("https://www.kariyer.net/is-ilani/acme-role")).toBe(false);
  });

  it("extracts card metadata and emits canonical, deduplicated job URLs", async () => {
    let currentUrl = listingUrl;
    const page = {
      goto: vi.fn(async (url: string) => {
        currentUrl = url;
      }),
      url: vi.fn(() => currentUrl),
      waitForTimeout: vi.fn(),
      evaluate: vi.fn().mockResolvedValue([
        rawListing(),
        rawListing({
          href: "https://www.kariyer.net/is-ilani/acme-yazilim-gelistirme-uzmani-4512345?tracking=duplicate",
          company: null,
          badges: ["Yeni"],
        }),
        rawListing({
          href: "https://evil.test/is-ilani/sahte-ilan-9999999",
          title: "Sahte ilan",
        }),
      ]),
    };

    await expect(extractKariyerListings(page as never, listingUrl)).resolves.toEqual([
      {
        jobId: "4512345",
        url: "https://www.kariyer.net/is-ilani/acme-yazilim-gelistirme-uzmani-4512345",
        title: "Yazılım Geliştirme Uzmanı",
        company: "Acme Teknoloji",
        location: "İstanbul (Avr.)",
        workplaceType: "Hibrit",
        badges: ["Tam Zamanlı", "Hibrit", "Yeni"],
        posted: "2 gün önce",
      },
    ]);
    expect(page.goto).toHaveBeenCalledWith(new URL(listingUrl).toString(), {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
  });

  it("follows safe cp pagination until the requested unique count is reached", async () => {
    let currentUrl = listingUrl;
    const pageOne = [rawListing({ company: null, badges: ["Hibrit"] })];
    const pageTwo = [
      rawListing({ company: "Acme Teknoloji", badges: ["Yeni"] }),
      rawListing({
        href: "/is-ilani/beta-frontend-developer-4512346",
        title: "Frontend Developer",
        company: "Beta",
      }),
      rawListing({
        href: "/is-ilani/gamma-backend-developer-4512347?ref=search",
        title: "Backend Developer",
        company: "Gamma",
      }),
    ];
    const page = {
      goto: vi.fn(async (url: string) => {
        currentUrl = url;
      }),
      url: vi.fn(() => currentUrl),
      waitForTimeout: vi.fn(),
      evaluate: vi.fn(async () =>
        new URL(currentUrl).searchParams.get("cp") === "2" ? pageTwo : pageOne,
      ),
      locator: vi.fn(() => ({
        first: () => ({
          count: vi.fn(async () =>
            new URL(currentUrl).searchParams.get("cp") === "2" ? 0 : 1,
          ),
          getAttribute: vi.fn(async (name: string) => {
            if (name === "aria-disabled") {
              return null;
            }
            if (name === "href") {
              return "/is-ilanlari/yazilim+gelistirme+uzmani?pst=3193&pkw=yaz%C4%B1l%C4%B1m%20geli%C5%9Ftirme%20uzman%C4%B1&cp=2";
            }
            return null;
          }),
        }),
      })),
    };

    await expect(
      extractKariyerListingsBatch(page as never, listingUrl, 3),
    ).resolves.toMatchObject({
      pagesVisited: 2,
      listings: [
        expect.objectContaining({
          jobId: "4512345",
          company: "Acme Teknoloji",
          badges: ["Hibrit", "Yeni"],
        }),
        expect.objectContaining({ jobId: "4512346", title: "Frontend Developer" }),
        expect.objectContaining({ jobId: "4512347", title: "Backend Developer" }),
      ],
    });
    expect(page.goto).toHaveBeenCalledTimes(2);
  });

  it("does not follow absolute, cross-origin, or non-advancing pagination hrefs", async () => {
    for (const href of [
      "https://evil.test/is-ilanlari/yazilim?cp=2",
      "//www.kariyer.net/is-ilanlari/yazilim?cp=2",
      "?cp=1",
      "/is-ilanlari/yazilim?pst=3193&cp=2oops",
      "/is-ilanlari/yazilim?pst=3193&cp=2&unexpected=1",
    ]) {
      let currentUrl = "https://www.kariyer.net/is-ilanlari/yazilim?pst=3193";
      const page = {
        goto: vi.fn(async (url: string) => {
          currentUrl = url;
        }),
        url: vi.fn(() => currentUrl),
        waitForTimeout: vi.fn(),
        evaluate: vi.fn().mockResolvedValue([rawListing()]),
        locator: vi.fn(() => ({
          first: () => ({
            count: vi.fn(async () => 1),
            getAttribute: vi.fn(async (name: string) =>
              name === "href" ? href : null,
            ),
          }),
        })),
      };

      await expect(
        extractKariyerListingsBatch(page as never, currentUrl, 2),
      ).resolves.toMatchObject({
        pagesVisited: 1,
        listings: [expect.objectContaining({ jobId: "4512345" })],
      });
      expect(page.goto).toHaveBeenCalledTimes(1);
    }
  });
});
