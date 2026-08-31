import { describe, expect, it, vi } from "vitest";
import {
  assertKariyerPageReady,
  createKariyerNavigationContext,
  detectKariyerPageState,
  findKariyerPageStateError,
  KariyerPageStateError,
  navigateKariyerPage,
  type KariyerPageStateResult,
} from "../../src/kariyer/pageState.js";

function pageFixture(input: {
  url?: string;
  title?: string;
  body?: string;
  authForm?: boolean;
  goto?: () => Promise<unknown>;
}) {
  return {
    url: vi.fn(() => input.url ?? "https://www.kariyer.net/is-ilanlari/yazilim"),
    title: vi.fn(async () => input.title ?? "Kariyer.net"),
    goto: vi.fn(input.goto ?? (async () => null)),
    locator: vi.fn((selector: string) => {
      if (selector === "body") return { innerText: vi.fn(async () => input.body ?? "") };
      const count = input.authForm && selector.includes("password") ? 1 : 0;
      return { first: () => ({ count: vi.fn(async () => count), isVisible: vi.fn(async () => count > 0) }) };
    }),
  };
}

function responseFixture(options: {
  status?: number;
  retryAfter?: string;
  useHeadersFallback?: boolean;
}) {
  return options.useHeadersFallback
    ? {
        status: () => options.status ?? 200,
        headers: async () => ({ "Retry-After": options.retryAfter ?? "" }),
      }
    : {
        status: () => options.status ?? 200,
        headerValue: async () => options.retryAfter ?? null,
      };
}

const okResult: KariyerPageStateResult = {
  state: "ok",
  url: "https://www.kariyer.net/is-ilanlari/yazilim",
  marker: null,
  statusCode: 200,
  retryAfterMs: null,
};

describe("Kariyer page-state edge cases", () => {
  it("normalizes invalid timing options and floors finite durations", () => {
    const defaults = createKariyerNavigationContext({
      minIntervalMs: -1,
      maxRetryAfterMs: Number.NaN,
    });
    const custom = createKariyerNavigationContext({
      minIntervalMs: 1234.9,
      maxRetryAfterMs: 9876.8,
    });

    expect(defaults.minIntervalMs).toBe(5_000);
    expect(defaults.maxRetryAfterMs).toBe(120_000);
    expect(custom.minIntervalMs).toBe(1_234);
    expect(custom.maxRetryAfterMs).toBe(9_876);
  });

  it("spaces consecutive navigations but never sleeps before the first", async () => {
    let now = 10_000;
    const sleep = vi.fn(async (delay: number) => { now += delay; });
    const context = createKariyerNavigationContext({
      minIntervalMs: 5_000,
      now: () => now,
      sleep,
    });

    await context.beforeNavigation();
    expect(sleep).not.toHaveBeenCalled();
    now += 1_000;
    await context.beforeNavigation();
    expect(sleep).toHaveBeenCalledWith(4_000);
    now += 6_000;
    await context.beforeNavigation();
    expect(sleep).toHaveBeenCalledOnce();
  });

  it("enforces the minimum interval for short rate-limit delays", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const context = createKariyerNavigationContext({ minIntervalMs: 2_000, sleep });

    await context.waitForRateLimit(250.9);

    expect(sleep).toHaveBeenCalledWith(2_000);
  });

  it("parses an HTTP-date Retry-After value relative to the supplied clock", async () => {
    const now = Date.parse("2026-08-31T12:00:00.000Z");
    const retryAt = "Mon, 31 Aug 2026 12:00:03 GMT";
    const result = await detectKariyerPageState(
      pageFixture({}) as never,
      responseFixture({ status: 429, retryAfter: retryAt }) as never,
      now,
    );

    expect(result).toMatchObject({
      state: "rate_limited",
      statusCode: 429,
      retryAfterMs: 3_000,
    });
  });

  it("reads Retry-After from the headers fallback and ignores malformed values", async () => {
    const valid = await detectKariyerPageState(
      pageFixture({}) as never,
      responseFixture({ status: 429, retryAfter: "7", useHeadersFallback: true }) as never,
      0,
    );
    const invalid = await detectKariyerPageState(
      pageFixture({}) as never,
      responseFixture({ status: 429, retryAfter: "eventually", useHeadersFallback: true }) as never,
      0,
    );

    expect(valid.retryAfterMs).toBe(7_000);
    expect(invalid.retryAfterMs).toBeNull();
  });

  it.each([
    "Too many requests. Please try again later.",
    "Çok fazla istek, daha sonra tekrar deneyin.",
  ])("detects a textual rate-limit wall: %s", async (body) => {
    await expect(detectKariyerPageState(pageFixture({ body }) as never))
      .resolves.toMatchObject({ state: "rate_limited", marker: "rate_limit_text" });
  });

  it("detects an auth form and an exact login title on an application page", async () => {
    const authForm = await detectKariyerPageState(pageFixture({
      url: "https://www.kariyer.net/basvuru/123",
      authForm: true,
    }) as never);
    const loginTitle = await detectKariyerPageState(pageFixture({
      url: "https://www.kariyer.net/application/123",
      title: "Kariyer.net - Üye Girişi",
    }) as never);

    expect(authForm).toMatchObject({ state: "login_required", marker: "login_form" });
    expect(loginTitle).toMatchObject({ state: "login_required", marker: "login_title" });
  });

  it("accepts a ready state and throws structured errors for every blocked state", () => {
    expect(() => assertKariyerPageReady(okResult, "listing scan")).not.toThrow();

    for (const [state, code, retryable, manualActionRequired] of [
      ["login_required", "KARIYER_LOGIN_REQUIRED", false, true],
      ["manual_verification", "KARIYER_MANUAL_VERIFICATION_REQUIRED", false, true],
      ["rate_limited", "KARIYER_RATE_LIMITED", true, false],
    ] as const) {
      const result: KariyerPageStateResult = {
        ...okResult,
        state,
        marker: "test-marker",
        retryAfterMs: state === "rate_limited" ? 5_000 : null,
      };
      let thrown: unknown;
      try {
        assertKariyerPageReady(result, "listing scan");
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(KariyerPageStateError);
      expect(thrown).toMatchObject({
        code,
        phase: "kariyer",
        details: expect.objectContaining({
          context: "listing scan",
          retryable,
          manualActionRequired,
        }),
      });
    }
  });

  it("finds nested page-state errors and terminates safely on cause cycles", () => {
    const pageError = new KariyerPageStateError(
      { ...okResult, state: "manual_verification" },
      "application",
    );
    const outer = new Error("outer", { cause: new Error("middle", { cause: pageError }) });
    expect(findKariyerPageStateError(outer)).toBe(pageError);
    expect(findKariyerPageStateError("not an error")).toBeNull();

    const cycle = new Error("cycle");
    Object.defineProperty(cycle, "cause", { value: cycle });
    expect(findKariyerPageStateError(cycle)).toBeNull();
  });

  it("refuses Retry-After delays above the configured maximum", async () => {
    const waitForRateLimit = vi.fn();
    const context = {
      minIntervalMs: 0,
      maxRetryAfterMs: 5_000,
      now: () => 0,
      beforeNavigation: vi.fn().mockResolvedValue(undefined),
      waitForRateLimit,
    };
    const page = pageFixture({
      goto: async () => responseFixture({ status: 429, retryAfter: "10" }),
    });

    await expect(navigateKariyerPage(page as never, page.url(), {
      context: "listing scan",
      navigationContext: context,
    })).rejects.toMatchObject({ code: "KARIYER_RATE_LIMITED" });
    expect(waitForRateLimit).not.toHaveBeenCalled();
    expect(page.goto).toHaveBeenCalledOnce();
  });

  it("fails after the second consecutive rate-limit response", async () => {
    const context = createKariyerNavigationContext({
      minIntervalMs: 0,
      maxRetryAfterMs: 10_000,
      now: () => 0,
      sleep: vi.fn().mockResolvedValue(undefined),
    });
    const page = pageFixture({
      goto: async () => responseFixture({ status: 429, retryAfter: "1" }),
    });

    await expect(navigateKariyerPage(page as never, page.url(), {
      context: "listing scan",
      navigationContext: context,
    })).rejects.toMatchObject({ code: "KARIYER_RATE_LIMITED" });
    expect(page.goto).toHaveBeenCalledTimes(2);
  });
});
