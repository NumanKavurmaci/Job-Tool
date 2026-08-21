import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import type { Page, Request, Route } from "@playwright/test";

export type NavigationHostnameResolver = (hostname: string) => Promise<readonly string[]>;

export type NavigationSafetyOptions = {
  allowPrivateHosts?: boolean;
  requireHttps?: boolean;
  allowedHostname?: (hostname: string) => boolean;
  hostnameResolver?: NavigationHostnameResolver;
  context?: string;
};

export type UnsafeNavigationReason =
  | "invalid_url"
  | "unsupported_protocol"
  | "embedded_credentials"
  | "private_host"
  | "dns_resolution_failed"
  | "disallowed_host";

function describeNavigationInput(input: string): string {
  try {
    const parsed = new URL(input.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.origin.replace(/\/\/[^@/]+@/, "//[redacted]@")
      : parsed.protocol;
  } catch {
    return "<invalid URL>";
  }
}

export class UnsafeNavigationUrlError extends Error {
  readonly code = "UNSAFE_NAVIGATION_URL";
  readonly input: string;

  constructor(
    input: string,
    readonly reason: UnsafeNavigationReason,
    context = "Navigation",
  ) {
    const safeInput = describeNavigationInput(input);
    super(`${context} blocked an unsafe URL (${reason}): ${safeInput}`);
    this.name = "UnsafeNavigationUrlError";
    this.input = safeInput;
  }
}

const PRIVATE_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".localdomain",
  ".lan",
  ".home",
  ".internal",
  ".intranet",
  ".svc",
];

const METADATA_HOSTNAMES = new Set([
  "metadata",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
  "instance-data.ec2.internal",
  "host.docker.internal",
  "gateway.docker.internal",
  "kubernetes.default",
  "kubernetes.default.svc",
  "kubernetes.default.svc.cluster.local",
]);

function normalizeHostname(hostname: string): string {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
}

function parseIpv4(hostname: string): [number, number, number, number] | null {
  if (isIP(hostname) !== 4) {
    return null;
  }

  const octets = hostname.split(".").map((part) => Number.parseInt(part, 10));
  return octets.length === 4
    ? (octets as [number, number, number, number])
    : null;
}

function isUnsafeIpv4(hostname: string): boolean {
  const octets = parseIpv4(hostname);
  if (!octets) {
    return false;
  }

  const [first, second, third, fourth] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224 ||
    (first === 168 && second === 63 && third === 129 && fourth === 16)
  );
}

function parseIpv6Words(hostname: string): number[] | null {
  if (isIP(hostname) !== 6) {
    return null;
  }

  const scopedAddress = hostname.split("%")[0] ?? hostname;
  const halves = scopedAddress.split("::");
  if (halves.length > 2) {
    return null;
  }

  const parseHalf = (half: string): number[] =>
    half
      ? half.split(":").map((word) => Number.parseInt(word, 16))
      : [];
  const left = parseHalf(halves[0] ?? "");
  const right = parseHalf(halves[1] ?? "");
  const missing = 8 - left.length - right.length;

  if ((halves.length === 1 && missing !== 0) || missing < 0) {
    return null;
  }

  return halves.length === 2
    ? [...left, ...Array.from({ length: missing }, () => 0), ...right]
    : left;
}

function ipv4FromIpv6Words(high: number, low: number): string {
  return [high >>> 8, high & 0xff, low >>> 8, low & 0xff].join(".");
}

function hasUnsafeEmbeddedIpv4(words: number[]): boolean {
  const isCompatibleOrMapped =
    words.slice(0, 5).every((word) => word === 0) &&
    (words[5] === 0 || words[5] === 0xffff);
  if (isCompatibleOrMapped) {
    return isUnsafeIpv4(ipv4FromIpv6Words(words[6] ?? 0, words[7] ?? 0));
  }

  const isNat64WellKnownPrefix =
    words[0] === 0x64 &&
    words[1] === 0xff9b &&
    words.slice(2, 6).every((word) => word === 0);
  if (isNat64WellKnownPrefix) {
    return isUnsafeIpv4(ipv4FromIpv6Words(words[6] ?? 0, words[7] ?? 0));
  }

  if (words[0] === 0x2002) {
    return isUnsafeIpv4(ipv4FromIpv6Words(words[1] ?? 0, words[2] ?? 0));
  }

  return false;
}

function isUnsafeIpv6(hostname: string): boolean {
  const words = parseIpv6Words(hostname);
  if (!words) {
    return false;
  }

  const first = words[0] ?? 0;
  const isUnspecified = words.every((word) => word === 0);
  const isLoopback = words.slice(0, 7).every((word) => word === 0) && words[7] === 1;

  return (
    isUnspecified ||
    isLoopback ||
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 ||
    (first & 0xffc0) === 0xfec0 ||
    (first & 0xff00) === 0xff00 ||
    hasUnsafeEmbeddedIpv4(words)
  );
}

function isPrivateHostname(hostname: string): boolean {
  if (
    hostname === "localhost" ||
    METADATA_HOSTNAMES.has(hostname) ||
    PRIVATE_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    return true;
  }

  if (isIP(hostname) === 0 && !hostname.includes(".")) {
    return true;
  }

  return isUnsafeIpv4(hostname) || isUnsafeIpv6(hostname);
}

const nodeHostnameResolver: NavigationHostnameResolver = async (hostname) => {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  return addresses.map((entry) => entry.address);
};

async function resolveHostnameWithTimeout(
  hostname: string,
  resolver: NavigationHostnameResolver,
): Promise<readonly string[]> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      resolver(hostname),
      new Promise<readonly string[]>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("DNS resolution timed out")), 5_000);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

async function assertSafeNavigationDnsResolution(
  input: string,
  options: NavigationSafetyOptions,
  resolver: NavigationHostnameResolver,
): Promise<void> {
  const parsed = assertSafeNavigationUrl(input, options);
  if (options.allowPrivateHosts) {
    return;
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (isIP(hostname) !== 0) {
    return;
  }

  let addresses: readonly string[];
  try {
    addresses = await resolveHostnameWithTimeout(hostname, resolver);
  } catch {
    throw new UnsafeNavigationUrlError(
      input,
      "dns_resolution_failed",
      options.context ?? "Navigation",
    );
  }

  if (addresses.length === 0) {
    throw new UnsafeNavigationUrlError(
      input,
      "dns_resolution_failed",
      options.context ?? "Navigation",
    );
  }

  for (const address of addresses) {
    const normalizedAddress = normalizeHostname(address);
    if (isIP(normalizedAddress) === 0) {
      throw new UnsafeNavigationUrlError(
        input,
        "dns_resolution_failed",
        options.context ?? "Navigation",
      );
    }
    if (isPrivateHostname(normalizedAddress)) {
      throw new UnsafeNavigationUrlError(
        input,
        "private_host",
        options.context ?? "Navigation",
      );
    }
  }
}

export function isLinkedInHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return normalized === "linkedin.com" || normalized.endsWith(".linkedin.com");
}

export function assertSafeNavigationUrl(
  input: string,
  options: NavigationSafetyOptions = {},
): URL {
  const context = options.context ?? "Navigation";
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    throw new UnsafeNavigationUrlError(input, "invalid_url", context);
  }

  const allowedProtocols = options.requireHttps ? new Set(["https:"]) : new Set(["http:", "https:"]);
  if (!allowedProtocols.has(parsed.protocol)) {
    throw new UnsafeNavigationUrlError(input, "unsupported_protocol", context);
  }

  if (parsed.username || parsed.password) {
    throw new UnsafeNavigationUrlError(input, "embedded_credentials", context);
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (!hostname) {
    throw new UnsafeNavigationUrlError(input, "invalid_url", context);
  }

  if (isLinkedInHostname(hostname) && parsed.protocol !== "https:") {
    throw new UnsafeNavigationUrlError(input, "unsupported_protocol", context);
  }

  if (isLinkedInHostname(hostname) && parsed.port && parsed.port !== "443") {
    throw new UnsafeNavigationUrlError(input, "disallowed_host", context);
  }

  if (!options.allowPrivateHosts && isPrivateHostname(hostname)) {
    throw new UnsafeNavigationUrlError(input, "private_host", context);
  }

  if (options.allowedHostname && !options.allowedHostname(hostname)) {
    throw new UnsafeNavigationUrlError(input, "disallowed_host", context);
  }

  return parsed;
}

export function isSafeNavigationUrl(
  input: string,
  options: NavigationSafetyOptions = {},
): boolean {
  try {
    assertSafeNavigationUrl(input, options);
    return true;
  } catch {
    return false;
  }
}

export function assertSafeLinkedInNavigationUrl(input: string, context = "LinkedIn navigation"): URL {
  const parsed = assertSafeNavigationUrl(input, {
    requireHttps: true,
    allowedHostname: isLinkedInHostname,
    context,
  });

  if (parsed.port && parsed.port !== "443") {
    throw new UnsafeNavigationUrlError(input, "disallowed_host", context);
  }

  return parsed;
}

function toUnsafeNavigationError(error: unknown): UnsafeNavigationUrlError | null {
  return error instanceof UnsafeNavigationUrlError ? error : null;
}

type NavigationCdpSession = {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
  on(event: string, listener: (event: unknown) => void): void;
  off(event: string, listener: (event: unknown) => void): void;
  detach(): Promise<void>;
};

type NavigationCdpGuard = {
  getBlockedError(): UnsafeNavigationUrlError | null;
  dispose(): Promise<void>;
};

async function installCdpNavigationGuard(
  page: Page,
  safetyOptions: NavigationSafetyOptions,
): Promise<NavigationCdpGuard | null> {
  const pageWithOptionalContext = page as Page & { context?: Page["context"] };
  if (typeof pageWithOptionalContext.context !== "function") {
    return null;
  }

  const context = pageWithOptionalContext.context() as ReturnType<Page["context"]> & {
    newCDPSession?: (target: Page) => Promise<NavigationCdpSession>;
  };
  if (typeof context.newCDPSession !== "function") {
    return null;
  }

  let session: NavigationCdpSession;
  try {
    session = (await context.newCDPSession(page)) as unknown as NavigationCdpSession;
  } catch {
    return null;
  }

  let mainFrameId: string | null = null;
  try {
    const frameTree = (await session.send("Page.getFrameTree")) as {
      frameTree?: { frame?: { id?: unknown } };
    };
    mainFrameId =
      typeof frameTree.frameTree?.frame?.id === "string"
        ? frameTree.frameTree.frame.id
        : null;
  } catch {
    // If the frame id cannot be read, guarding all document requests is the safer fallback.
  }

  let blockedError: UnsafeNavigationUrlError | null = null;
  const hostnameResolver = safetyOptions.hostnameResolver ?? nodeHostnameResolver;
  const processPausedRequest = async (rawEvent: unknown): Promise<void> => {
    const event = rawEvent as {
      requestId?: unknown;
      frameId?: unknown;
      resourceType?: unknown;
      request?: { url?: unknown };
    };
    if (typeof event.requestId !== "string") {
      return;
    }

    const shouldValidate =
      event.resourceType === "Document" &&
      (mainFrameId === null || event.frameId === mainFrameId);
    if (!shouldValidate || typeof event.request?.url !== "string") {
      await session
        .send("Fetch.continueRequest", { requestId: event.requestId })
        .catch(() => undefined);
      return;
    }

    try {
      await assertSafeNavigationDnsResolution(
        event.request.url,
        safetyOptions,
        hostnameResolver,
      );
    } catch (error) {
      blockedError = toUnsafeNavigationError(error);
      await session
        .send("Fetch.failRequest", {
          requestId: event.requestId,
          errorReason: "BlockedByClient",
        })
        .catch(() => undefined);
      return;
    }

    await session
      .send("Fetch.continueRequest", { requestId: event.requestId })
      .catch(() => undefined);
  };
  const requestPausedHandler = (rawEvent: unknown): void => {
    void processPausedRequest(rawEvent).catch(() => undefined);
  };

  session.on("Fetch.requestPaused", requestPausedHandler);
  try {
    await session.send("Fetch.enable", {
      patterns: [
        {
          urlPattern: "*",
          resourceType: "Document",
          requestStage: "Request",
        },
      ],
    });
  } catch {
    session.off("Fetch.requestPaused", requestPausedHandler);
    await session.detach().catch(() => undefined);
    return null;
  }

  return {
    getBlockedError: () => blockedError,
    async dispose() {
      session.off("Fetch.requestPaused", requestPausedHandler);
      await session.send("Fetch.disable").catch(() => undefined);
      await session.detach().catch(() => undefined);
    },
  };
}

export async function safePageGoto(
  page: Page,
  input: string,
  gotoOptions?: Parameters<Page["goto"]>[1],
  safetyOptions: NavigationSafetyOptions = {},
): Promise<Awaited<ReturnType<Page["goto"]>>> {
  assertSafeNavigationUrl(input, safetyOptions);
  if (safetyOptions.hostnameResolver) {
    await assertSafeNavigationDnsResolution(
      input,
      safetyOptions,
      safetyOptions.hostnameResolver,
    );
  }

  let blockedError: UnsafeNavigationUrlError | null = null;
  const routeHandler = async (route: Route, request: Request): Promise<void> => {
    if (!request.isNavigationRequest() || request.frame() !== page.mainFrame()) {
      await route.fallback();
      return;
    }

    try {
      assertSafeNavigationUrl(request.url(), safetyOptions);
      await route.fallback();
    } catch (error) {
      blockedError = toUnsafeNavigationError(error);
      await route.abort("blockedbyclient");
    }
  };

  const routeCapablePage = page as Page & {
    route?: Page["route"];
    unroute?: Page["unroute"];
    mainFrame?: Page["mainFrame"];
  };
  const canInterceptRedirects =
    typeof routeCapablePage.route === "function" &&
    typeof routeCapablePage.unroute === "function" &&
    typeof routeCapablePage.mainFrame === "function";

  const cdpGuard = await installCdpNavigationGuard(page, safetyOptions);
  let routeInstalled = false;

  try {
    if (canInterceptRedirects) {
      await page.route("**/*", routeHandler);
      routeInstalled = true;
    }

    let response: Awaited<ReturnType<Page["goto"]>>;
    try {
      response =
        gotoOptions === undefined
          ? await page.goto(input)
          : await page.goto(input, gotoOptions);
    } catch (error) {
      const navigationError = blockedError ?? cdpGuard?.getBlockedError();
      if (navigationError) {
        throw navigationError;
      }
      throw error;
    }

    const navigationError = blockedError ?? cdpGuard?.getBlockedError();
    if (navigationError) {
      throw navigationError;
    }

    const pageWithOptionalUrl = page as Page & { url?: Page["url"] };
    const finalUrl =
      typeof pageWithOptionalUrl.url === "function" ? pageWithOptionalUrl.url() : input;
    assertSafeNavigationUrl(finalUrl, safetyOptions);
    return response;
  } finally {
    if (routeInstalled) {
      await page.unroute("**/*", routeHandler).catch(() => undefined);
    }
    await cdpGuard?.dispose();
  }
}

export async function safeLinkedInPageGoto(
  page: Page,
  input: string,
  gotoOptions?: Parameters<Page["goto"]>[1],
): Promise<Awaited<ReturnType<Page["goto"]>>> {
  assertSafeLinkedInNavigationUrl(input);
  return safePageGoto(page, input, gotoOptions, {
    requireHttps: true,
    allowedHostname: isLinkedInHostname,
    context: "LinkedIn navigation",
  });
}
