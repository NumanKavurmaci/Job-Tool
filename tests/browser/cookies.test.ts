import { chromium, type Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptAllCookiePrompts } from "../../src/browser/cookies.js";

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser.close();
});

describe("acceptAllCookiePrompts", () => {
  it("clicks an accept-all cookie action when the surrounding banner is cookie-related", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <div role="dialog" aria-label="Cookie preferences">
        <p>We use cookies to improve the site.</p>
        <button onclick="document.body.dataset.cookieAccepted='yes'; this.remove()">Accept all cookies</button>
      </div>
    `);

    const accepted = await acceptAllCookiePrompts(page);
    const cookieAccepted = await page.evaluate(() => document.body.dataset.cookieAccepted ?? null);

    expect(accepted).toEqual([
      expect.objectContaining({
        label: "Accept all cookies",
      }),
    ]);
    expect(cookieAccepted).toBe("yes");

    await page.close();
  });

  it("does not click unrelated accept buttons outside a cookie/privacy context", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <form>
        <label>
          Accept referral terms
          <button type="button" onclick="document.body.dataset.unrelatedAccepted='yes'">Accept</button>
        </label>
      </form>
    `);

    const accepted = await acceptAllCookiePrompts(page);
    const unrelatedAccepted = await page.evaluate(() => document.body.dataset.unrelatedAccepted ?? null);

    expect(accepted).toEqual([]);
    expect(unrelatedAccepted).toBeNull();

    await page.close();
  });

  it("ignores frames that cannot evaluate DOM code", async () => {
    const accepted = await acceptAllCookiePrompts({
      frames: () => [{ url: () => "https://example.com/frame" }],
    } as never);

    expect(accepted).toEqual([]);
  });

  it("accepts a cookie action when the page does not expose a settle timer", async () => {
    let evaluated = false;
    const accepted = await acceptAllCookiePrompts({
      frames: () => [{
        url: () => "https://example.com/frame",
        evaluate: async () => {
          if (evaluated) {
            return null;
          }
          evaluated = true;
          return "Accept all cookies";
        },
      }],
    } as never);

    expect(accepted).toEqual([
      expect.objectContaining({
        label: "Accept all cookies",
        frameUrl: "https://example.com/frame",
      }),
    ]);
  });
});
