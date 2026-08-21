import { describe, expect, it, vi } from "vitest";
import {
  createKariyerNavigationContext,
  detectKariyerPageState,
  inspectKariyerPageOrThrow,
  KariyerPageStateError,
  navigateKariyerPage,
} from "../../src/kariyer/pageState.js";

function createPage(input: {
  url?: string;
  title?: string;
  body?: string;
  loginVisible?: boolean;
  goto?: (url: string) => Promise<unknown>;
}) {
  return {
    url: vi.fn(() => input.url ?? "https://www.kariyer.net/is-ilanlari/yazilim"),
    title: vi.fn(async () => input.title ?? "Kariyer.net"),
    goto: vi.fn(input.goto ?? (async () => null)),
    waitForTimeout: vi.fn(async () => undefined),
    locator: vi.fn((selector: string) => {
      if (selector === "body") {
        return { innerText: vi.fn(async () => input.body ?? "") };
      }
      return {
        first: () => ({
          count: vi.fn(async () => input.loginVisible ? 1 : 0),
          isVisible: vi.fn(async () => Boolean(input.loginVisible)),
        }),
      };
    }),
  };
}

function response(status: number, retryAfter?: string) {
  return {
    status: () => status,
    headerValue: async (name: string) =>
      name.toLowerCase() === "retry-after" ? retryAfter ?? null : null,
  };
}

describe("Kariyer.net page-state safety", () => {
  it("keeps a genuine empty result page distinct from a security challenge", async () => {
    const page = createPage({ body: "Aramana uygun ilan bulunamadı." });

    await expect(detectKariyerPageState(page as never)).resolves.toMatchObject({
      state: "ok",
      marker: null,
    });
  });

  it.each([
    {
      name: "challenge marker",
      page: createPage({
        title: "Access to this page has been denied",
        body: "Lütfen butona basılı tutarak güvenlik doğrulamasını tamamlayın.",
      }),
      response: undefined,
      expectedState: "manual_verification",
      expectedCode: "KARIYER_MANUAL_VERIFICATION_REQUIRED",
    },
    {
      name: "HTTP 403",
      page: createPage({}),
      response: response(403),
      expectedState: "manual_verification",
      expectedCode: "KARIYER_MANUAL_VERIFICATION_REQUIRED",
    },
    {
      name: "login wall",
      page: createPage({
        url: "https://www.kariyer.net/uye-girisi",
        loginVisible: true,
      }),
      response: undefined,
      expectedState: "login_required",
      expectedCode: "KARIYER_LOGIN_REQUIRED",
    },
  ])("fails closed with a typed error for $name", async (testCase) => {
    const result = await detectKariyerPageState(
      testCase.page as never,
      testCase.response as never,
    );
    expect(result.state).toBe(testCase.expectedState);

    try {
      await inspectKariyerPageOrThrow(
        testCase.page as never,
        "test navigation",
        testCase.response as never,
      );
      throw new Error("Expected Kariyer page-state failure.");
    } catch (error) {
      expect(error).toBeInstanceOf(KariyerPageStateError);
      expect((error as KariyerPageStateError).code).toBe(testCase.expectedCode);
    }
  });

  it("honors Retry-After once before retrying a 429 response", async () => {
    let now = 0;
    let navigationCount = 0;
    const waits: number[] = [];
    const page = createPage({
      goto: async () => {
        navigationCount += 1;
        return navigationCount === 1 ? response(429, "2") : response(200);
      },
    });
    const navigationContext = createKariyerNavigationContext({
      minIntervalMs: 1_000,
      maxRetryAfterMs: 10_000,
      now: () => now,
      sleep: async (delayMs) => {
        waits.push(delayMs);
        now += delayMs;
      },
    });

    await expect(
      navigateKariyerPage(page as never, page.url(), {
        navigationContext,
        context: "test rate limit",
      }),
    ).resolves.toBeTruthy();
    expect(navigationCount).toBe(2);
    expect(waits).toEqual([2_000]);
  });

  it("does not automatically retry a manual verification challenge", async () => {
    let navigationCount = 0;
    const page = createPage({
      goto: async () => {
        navigationCount += 1;
        return response(403);
      },
    });
    const navigationContext = createKariyerNavigationContext({
      minIntervalMs: 0,
      sleep: vi.fn(),
    });

    await expect(
      navigateKariyerPage(page as never, page.url(), {
        navigationContext,
        context: "test challenge",
      }),
    ).rejects.toMatchObject({
      code: "KARIYER_MANUAL_VERIFICATION_REQUIRED",
    });
    expect(navigationCount).toBe(1);
  });
});
