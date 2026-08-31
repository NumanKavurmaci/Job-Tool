import type { Page, Response } from "@playwright/test";
import {
  safePageGoto,
  type NavigationSafetyOptions,
} from "../security/navigationSafety.js";
import { AppError } from "../utils/errors.js";

export type KariyerPageState =
  | "ok"
  | "login_required"
  | "manual_verification"
  | "rate_limited";

export interface KariyerPageStateResult {
  state: KariyerPageState;
  url: string;
  marker: string | null;
  statusCode: number | null;
  retryAfterMs: number | null;
}

export interface KariyerNavigationContext {
  readonly minIntervalMs: number;
  readonly maxRetryAfterMs: number;
  now(): number;
  beforeNavigation(): Promise<void>;
  waitForRateLimit(delayMs: number): Promise<void>;
}

export interface KariyerNavigationContextOptions {
  minIntervalMs?: number;
  maxRetryAfterMs?: number;
  now?: () => number;
  sleep?: (delayMs: number) => Promise<void>;
}

export interface NavigateKariyerPageOptions {
  navigationContext?: KariyerNavigationContext;
  gotoOptions?: Parameters<Page["goto"]>[1];
  safetyOptions?: NavigationSafetyOptions;
  context: string;
}

const DEFAULT_MIN_NAVIGATION_INTERVAL_MS = 5_000;
const DEFAULT_RATE_LIMIT_DELAY_MS = 30_000;
const DEFAULT_MAX_RETRY_AFTER_MS = 120_000;

const MANUAL_VERIFICATION_PATTERN =
  /access to this page has been denied|güvenlik doğrulaması|guvenlik dogrulamasi|butona basılı tut|butona basili tut|verify (?:that )?you are human|unusual traffic|robot olmadığınızı|robot olmadiginizi|\b(?:recaptcha|hcaptcha|turnstile|captcha)\b/iu;
const RATE_LIMIT_PATTERN =
  /too many requests|çok fazla istek|cok fazla istek|rate limit|istek sınırı|istek siniri|daha sonra tekrar deneyin/iu;
const LOGIN_PATH_PATTERN = /\/(?:login|giris|uye-girisi|aday-girisi)(?:\/|$)/iu;
const APPLICATION_PATH_PATTERN =
  /\/(?:basvuru|başvuru|application|apply)(?:\/|$)/iu;
const JOB_DETAIL_PATH_PATTERN = /^\/is-ilani\//iu;
const AUTH_FORM_SELECTOR =
  "input[type='password'], form[action*='login' i], form[action*='giris' i], form[action*='signin' i]";
const AUTH_WALL_TITLE_PATTERN =
  /^(?:(?:kariyer\.net|kariyer)\s*[-|:]?\s*)?(?:(?:üye|uye|aday)\s+)?(?:girişi|girisi|giriş|giris|login|sign in)\s*$/iu;
const AUTH_WALL_TEXT_PATTERN =
  /(?:başvuru|basvuru|devam etmek|hesabınız|hesabiniz|aday hesabı|aday hesabi).{0,80}(?:giriş yap|giris yap|oturum aç|oturum ac)|(?:giriş yap|giris yap|oturum aç|oturum ac).{0,80}(?:gerekiyor|gerekir|zorunlu|başvuru|basvuru|devam)|(?:sign in|log in|login).{0,80}(?:required|to apply|to continue)/iu;

function normalizeDuration(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || value == null || value < 0) {
    return fallback;
  }
  return Math.floor(value);
}

export function createKariyerNavigationContext(
  options: KariyerNavigationContextOptions = {},
): KariyerNavigationContext {
  const minIntervalMs = normalizeDuration(
    options.minIntervalMs,
    DEFAULT_MIN_NAVIGATION_INTERVAL_MS,
  );
  const maxRetryAfterMs = normalizeDuration(
    options.maxRetryAfterMs,
    DEFAULT_MAX_RETRY_AFTER_MS,
  );
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((delayMs: number) => new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  }));
  let lastNavigationAt: number | null = null;

  return {
    minIntervalMs,
    maxRetryAfterMs,
    now,
    async beforeNavigation() {
      if (lastNavigationAt != null) {
        const remainingMs = lastNavigationAt + minIntervalMs - now();
        if (remainingMs > 0) {
          await sleep(remainingMs);
        }
      }
      lastNavigationAt = now();
    },
    async waitForRateLimit(delayMs: number) {
      const boundedDelayMs = Math.max(minIntervalMs, Math.floor(delayMs));
      await sleep(boundedDelayMs);
      lastNavigationAt = now();
    },
  };
}

function getPageUrl(page: Page): string {
  try {
    return typeof page.url === "function" ? page.url() : "";
  } catch {
    return "";
  }
}

function redactUrl(value: string): string {
  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return value.slice(0, 500);
  }
}

async function readResponseStatus(response?: Response | null): Promise<number | null> {
  if (!response || typeof response.status !== "function") {
    return null;
  }
  try {
    return response.status();
  } catch {
    return null;
  }
}

async function readRetryAfterHeader(response?: Response | null): Promise<string | null> {
  if (!response) {
    return null;
  }

  const optionalResponse = response as unknown as {
    headerValue?: (name: string) => Promise<string | null>;
    headers?: () => Promise<Record<string, string>>;
  };
  if (typeof optionalResponse.headerValue === "function") {
    return optionalResponse.headerValue("retry-after").catch(() => null);
  }
  const readHeaders = optionalResponse.headers;
  if (typeof readHeaders === "function") {
    const headers = await readHeaders
      .call(response)
      .catch((): Record<string, string> => ({}));
    return headers["retry-after"] ?? headers["Retry-After"] ?? null;
  }
  return null;
}

function parseRetryAfterMs(value: string | null, now: number): number | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim();
  if (/^\d+$/.test(normalized)) {
    const seconds = Number(normalized);
    return Number.isSafeInteger(seconds) ? seconds * 1_000 : null;
  }
  const retryAt = Date.parse(normalized);
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - now) : null;
}

async function readPageText(page: Page): Promise<{ title: string; body: string }> {
  const optionalPage = page as Page & {
    title?: () => Promise<string>;
    locator?: Page["locator"];
  };
  const title = typeof optionalPage.title === "function"
    ? await optionalPage.title().catch(() => "")
    : "";
  if (typeof optionalPage.locator !== "function") {
    return { title, body: "" };
  }
  const bodyLocator = optionalPage.locator("body") as unknown as {
    innerText?: () => Promise<string>;
  };
  const body = typeof bodyLocator.innerText === "function"
    ? await bodyLocator.innerText().catch(() => "")
    : "";
  return { title, body: body.slice(0, 20_000) };
}

async function hasVisibleControl(page: Page, selector: string): Promise<boolean> {
  const optionalPage = page as Page & { locator?: Page["locator"] };
  if (typeof optionalPage.locator !== "function") {
    return false;
  }
  const rawLoginControl = optionalPage.locator(selector) as unknown as {
    first?: () => unknown;
    count?: () => Promise<number>;
    isVisible?: () => Promise<boolean>;
  };
  const loginControl = (
    typeof rawLoginControl.first === "function"
      ? rawLoginControl.first()
      : rawLoginControl
  ) as {
    count?: () => Promise<number>;
    isVisible?: () => Promise<boolean>;
  };
  return (
    typeof loginControl.count === "function" &&
    typeof loginControl.isVisible === "function" &&
    (await loginControl.count().catch(() => 0)) > 0 &&
    (await loginControl.isVisible().catch(() => false))
  );
}

function isProtectedKariyerContext(pathname: string, context?: string): boolean {
  return (
    APPLICATION_PATH_PATTERN.test(pathname) ||
    JOB_DETAIL_PATH_PATTERN.test(pathname) ||
    /\b(?:application|apply|job detail|başvuru|basvuru)\b/iu.test(context ?? "")
  );
}

export async function detectKariyerPageState(
  page: Page,
  response?: Response | null,
  now = Date.now(),
  context?: string,
): Promise<KariyerPageStateResult> {
  const currentUrl = getPageUrl(page);
  const safeUrl = redactUrl(currentUrl);
  const statusCode = await readResponseStatus(response);
  const retryAfterMs = parseRetryAfterMs(
    await readRetryAfterHeader(response),
    now,
  );
  let isKariyerPage = true;
  try {
    const hostname = new URL(currentUrl).hostname.toLowerCase().replace(/\.$/, "");
    isKariyerPage = hostname === "kariyer.net" || hostname.endsWith(".kariyer.net");
  } catch {
    // Pages without a readable URL are still inspected and fail closed on known markers.
  }
  if (!isKariyerPage) {
    return {
      state: "ok",
      url: safeUrl,
      marker: null,
      statusCode,
      retryAfterMs,
    };
  }

  const { title, body } = await readPageText(page);
  const pageText = `${title}\n${body}`;

  if (statusCode === 429 || statusCode === 503 || RATE_LIMIT_PATTERN.test(pageText)) {
    return {
      state: "rate_limited",
      url: safeUrl,
      marker: statusCode === 429 || statusCode === 503
        ? `http_${statusCode}`
        : "rate_limit_text",
      statusCode,
      retryAfterMs,
    };
  }

  if (statusCode === 403 || MANUAL_VERIFICATION_PATTERN.test(pageText)) {
    return {
      state: "manual_verification",
      url: safeUrl,
      marker: statusCode === 403 ? "http_403" : "verification_text",
      statusCode,
      retryAfterMs,
    };
  }

  let pathname = "";
  try {
    pathname = new URL(currentUrl).pathname;
  } catch {
    // The navigation safety layer owns malformed URL failures.
  }
  const hasAuthForm = await hasVisibleControl(page, AUTH_FORM_SELECTOR);
  const hasScopedLoginEvidence =
    isProtectedKariyerContext(pathname, context) &&
    AUTH_WALL_TEXT_PATTERN.test(pageText);
  const hasAuthWallTitle = AUTH_WALL_TITLE_PATTERN.test(title.trim());
  if (
    statusCode === 401 ||
    LOGIN_PATH_PATTERN.test(pathname) ||
    hasAuthForm ||
    hasAuthWallTitle ||
    hasScopedLoginEvidence
  ) {
    return {
      state: "login_required",
      url: safeUrl,
      marker: statusCode === 401
        ? "http_401"
        : LOGIN_PATH_PATTERN.test(pathname)
          ? "login_url"
          : hasAuthForm
            ? "login_form"
            : hasAuthWallTitle
              ? "login_title"
              : "auth_wall_text",
      statusCode,
      retryAfterMs,
    };
  }

  return {
    state: "ok",
    url: safeUrl,
    marker: null,
    statusCode,
    retryAfterMs,
  };
}

export class KariyerPageStateError extends AppError {
  readonly pageState: Exclude<KariyerPageState, "ok">;

  constructor(result: KariyerPageStateResult, context: string) {
    if (result.state === "ok") {
      throw new TypeError("KariyerPageStateError requires a blocking page state.");
    }
    const config = result.state === "login_required"
      ? {
        message: "Kariyer.net requires a signed-in candidate session. Sign in manually in the configured persistent browser profile before continuing.",
        code: "KARIYER_LOGIN_REQUIRED",
        retryable: false,
      }
      : result.state === "manual_verification"
        ? {
        message: "Kariyer.net requires manual security verification in the configured persistent browser profile before automation can continue.",
        code: "KARIYER_MANUAL_VERIFICATION_REQUIRED",
        retryable: false,
        }
        : {
        message: "Kariyer.net temporarily rate-limited navigation. The batch stopped without continuing to additional jobs.",
        code: "KARIYER_RATE_LIMITED",
        retryable: true,
        };
    super({
      message: config.message,
      phase: "kariyer",
      code: config.code,
      details: {
        context,
        pageState: result.state,
        url: result.url,
        marker: result.marker,
        statusCode: result.statusCode,
        retryAfterMs: result.retryAfterMs,
        retryable: config.retryable,
        manualActionRequired: result.state !== "rate_limited",
      },
    });
    this.name = "KariyerPageStateError";
    this.pageState = result.state;
  }
}

export function assertKariyerPageReady(
  result: KariyerPageStateResult,
  context: string,
): void {
  if (result.state !== "ok") {
    throw new KariyerPageStateError(result, context);
  }
}

export function findKariyerPageStateError(
  error: unknown,
): KariyerPageStateError | null {
  let current = error;
  const visited = new Set<unknown>();
  while (current && !visited.has(current)) {
    if (current instanceof KariyerPageStateError) {
      return current;
    }
    visited.add(current);
    current = current instanceof Error ? current.cause : null;
  }
  return null;
}

export async function inspectKariyerPageOrThrow(
  page: Page,
  context: string,
  response?: Response | null,
  now = Date.now(),
): Promise<KariyerPageStateResult> {
  const result = await detectKariyerPageState(page, response, now, context);
  assertKariyerPageReady(result, context);
  return result;
}

export async function navigateKariyerPage(
  page: Page,
  url: string,
  options: NavigateKariyerPageOptions,
): Promise<Response | null> {
  const navigationContext =
    options.navigationContext ?? createKariyerNavigationContext();
  let retryAfterWaitSatisfied = false;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!retryAfterWaitSatisfied) {
      await navigationContext.beforeNavigation();
    }
    retryAfterWaitSatisfied = false;
    const response = await safePageGoto(
      page,
      url,
      options.gotoOptions,
      options.safetyOptions,
    );
    const result = await detectKariyerPageState(
      page,
      response,
      navigationContext.now(),
      options.context,
    );
    if (result.state !== "rate_limited" || attempt > 0) {
      assertKariyerPageReady(result, options.context);
      return response;
    }

    const retryDelayMs = result.retryAfterMs ?? DEFAULT_RATE_LIMIT_DELAY_MS;
    if (retryDelayMs > navigationContext.maxRetryAfterMs) {
      throw new KariyerPageStateError(result, options.context);
    }
    await navigationContext.waitForRateLimit(retryDelayMs);
    retryAfterWaitSatisfied = true;
  }

  return null;
}
