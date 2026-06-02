import type { Frame, Page } from "@playwright/test";

export type CookiePromptAcceptance = {
  label: string;
  frameUrl: string | null;
  acceptedAt: string;
};

const COOKIE_BANNER_SETTLE_DELAY_MS = 250;

async function settleAfterCookieClick(page: Page): Promise<void> {
  const waitForTimeout = (page as Page & { waitForTimeout?: unknown }).waitForTimeout;
  if (typeof waitForTimeout === "function") {
    await page.waitForTimeout(COOKIE_BANNER_SETTLE_DELAY_MS).catch(() => undefined);
  }
}

async function clickAcceptAllInFrame(frame: Page | Frame): Promise<string | null> {
  if (typeof (frame as Page & { evaluate?: unknown }).evaluate !== "function") {
    return null;
  }

  /* c8 ignore start -- browser-context DOM traversal is exercised through Playwright, not node coverage */
  return frame.evaluate(() => {
    const doc = (globalThis as {
      document?: {
        querySelectorAll?: (selector: string) => Iterable<unknown>;
      };
      getComputedStyle?: (element: { [key: string]: unknown }) => {
        display?: string;
        visibility?: string;
        opacity?: string;
      } | null;
    }).document;
    const normalize = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
    const isVisible = (element: {
      hasAttribute?: (name: string) => boolean;
      getClientRects?: () => ArrayLike<unknown>;
      [key: string]: unknown;
    } | null) => {
      if (!element) {
        return false;
      }
      if (typeof element.hasAttribute === "function" && element.hasAttribute("hidden")) {
        return false;
      }
      const style = (globalThis as {
        getComputedStyle?: (node: { [key: string]: unknown }) => {
          display?: string;
          visibility?: string;
          opacity?: string;
        } | null;
      }).getComputedStyle?.(element);
      if (style) {
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
          return false;
        }
      }
      const rects = typeof element.getClientRects === "function" ? element.getClientRects() : [];
      return rects.length > 0;
    };
    const labelFor = (element: {
      value?: string | null;
      textContent?: string | null;
      getAttribute?: (name: string) => string | null;
    }) =>
      normalize(
        element.value || element.getAttribute?.("aria-label") || element.textContent,
      );
    const matchesAcceptAll = (label: string) =>
      /\b(accept|allow|agree to)\b.*\b(all|cookies)\b/i.test(label) ||
      /\bokay\b.*\bcookies?\b/i.test(label);
    const looksLikeNonAcceptAction = (label: string) =>
      /\b(reject|decline|deny|necessary only|manage|manage preferences|preferences|settings|customi[sz]e)\b/i.test(
        label,
      );
    const containerText = (element: {
      closest?: (selector: string) => {
        textContent?: string | null;
        getAttribute?: (name: string) => string | null;
      } | null;
      parentElement?: {
        textContent?: string | null;
        getAttribute?: (name: string) => string | null;
      } | null;
    }) => {
      const container =
        element.closest?.(
          [
            "#CybotCookiebotDialog",
            "#onetrust-banner-sdk",
            "#onetrust-consent-sdk",
            "[data-ui='cookie-consent']",
            "[id*='cookie']",
            "[class*='cookie']",
            "[id*='consent']",
            "[class*='consent']",
            "[aria-label*='cookie' i]",
            "[aria-label*='privacy' i]",
            "[role='dialog']",
            "dialog",
            "aside",
            "section",
            "footer",
          ].join(", "),
        ) ?? element.parentElement;
      const context = normalize(
        [
          container?.textContent,
          container?.getAttribute?.("id"),
          container?.getAttribute?.("class"),
          container?.getAttribute?.("aria-label"),
          container?.getAttribute?.("data-ui"),
          container?.getAttribute?.("data-testid"),
        ]
          .filter(Boolean)
          .join(" "),
      ).toLowerCase();
      return context;
    };
    const isCookieContext = (text: string) =>
      /\bcookies?\b|\bcookiebot\b|\bcybot\b|\bonetrust\b|\bprivacy\b|\bconsent\b/.test(text);

    const candidates = Array.from(
      doc?.querySelectorAll?.(
        [
          "[data-ui='cookie-consent'] [data-ui='cookie-consent-accept']",
          "button",
          "a",
          "[role='button']",
          "input[type='button']",
          "input[type='submit']",
        ].join(", "),
      ) ?? [],
    );

    for (const candidate of candidates) {
      const element = candidate as {
        hasAttribute?: (name: string) => boolean;
        getClientRects?: () => ArrayLike<unknown>;
        value?: string | null;
        textContent?: string | null;
        getAttribute?: (name: string) => string | null;
        closest?: (selector: string) => {
          textContent?: string | null;
          getAttribute?: (name: string) => string | null;
        } | null;
        parentElement?: {
          textContent?: string | null;
          getAttribute?: (name: string) => string | null;
        } | null;
        click?: () => void;
      };

      if (!isVisible(element)) {
        continue;
      }

      const label = labelFor(element);
      if (!label || !matchesAcceptAll(label) || looksLikeNonAcceptAction(label)) {
        continue;
      }

      const context = containerText(element);
      if (!isCookieContext(context)) {
        continue;
      }

      if (typeof element.click === "function") {
        element.click();
        return label;
      }
    }

    return null;
  }).catch(() => null);
  /* c8 ignore stop */
}

export async function acceptAllCookiePrompts(page: Page): Promise<CookiePromptAcceptance[]> {
  if (typeof (page as Page & { frames?: unknown }).frames !== "function") {
    return [];
  }

  const frames = page.frames();
  const accepted: CookiePromptAcceptance[] = [];

  for (let pass = 0; pass < 2; pass += 1) {
    let clickedOnPass = false;

    for (const frame of frames) {
      const label = await clickAcceptAllInFrame(frame);
      if (!label) {
        continue;
      }

      accepted.push({
        label,
        frameUrl: typeof frame.url === "function" ? frame.url() : null,
        acceptedAt: new Date().toISOString(),
      });
      clickedOnPass = true;
      await settleAfterCookieClick(page);
    }

    if (!clickedOnPass) {
      break;
    }
  }

  return accepted;
}
