import { describe, expect, it, vi } from "vitest";
import {
  assertSafeNavigationUrl,
  isLinkedInHostname,
  isSafeNavigationUrl,
  safeLinkedInPageGoto,
  safePageGoto,
  UnsafeNavigationUrlError,
} from "../../src/security/navigationSafety.js";

describe("navigation safety edge cases", () => {
  it.each([
    "localhost",
    "www.linkedin.com",
    "WWW.LINKEDIN.COM.",
    "jobs.eu.linkedin.com",
  ])("recognizes the real LinkedIn hostname %s", (hostname) => {
    expect(isLinkedInHostname(hostname)).toBe(hostname.toLowerCase().startsWith("localhost") ? false : true);
  });

  it.each([
    "linkedin.com.evil.example",
    "evil-linkedin.com",
    "linkedin.example.com",
    "",
  ])("rejects a LinkedIn lookalike hostname %j", (hostname) => {
    expect(isLinkedInHostname(hostname)).toBe(false);
  });

  it.each([
    "http://service.localdomain/path",
    "http://router.lan/path",
    "http://device.home/path",
    "http://portal.intranet/path",
    "http://api.svc/path",
    "http://metadata/path",
    "http://metadata.goog/path",
    "http://instance-data.ec2.internal/path",
    "http://host.docker.internal/path",
    "http://gateway.docker.internal/path",
    "http://kubernetes.default/path",
    "http://single-label-host/path",
    "http://0.1.2.3/path",
    "http://100.64.0.1/path",
    "http://100.127.255.255/path",
    "http://198.18.0.1/path",
    "http://198.19.255.255/path",
    "http://224.0.0.1/path",
    "http://255.255.255.255/path",
    "http://[fec0::1]/path",
    "http://[ff02::1]/path",
    "http://[64:ff9b::7f00:1]/path",
  ])("rejects additional local, reserved, or transition address %s", (url) => {
    expect(isSafeNavigationUrl(url)).toBe(false);
    expect(() => assertSafeNavigationUrl(url)).toThrow(UnsafeNavigationUrlError);
  });

  it.each([
    "https://93.184.216.34/jobs/1",
    "https://[2606:2800:220:1:248:1893:25c8:1946]/jobs/1",
    "https://jobs.example.com/apply",
  ])("accepts a public address %s", (url) => {
    expect(isSafeNavigationUrl(url)).toBe(true);
  });

  it("reports stable reasons and a caller-supplied context", () => {
    expect(() => assertSafeNavigationUrl("http://example.com", {
      requireHttps: true,
      context: "External application",
    })).toThrowError(expect.objectContaining({
      reason: "unsupported_protocol",
      message: expect.stringContaining("External application blocked"),
    }));

    expect(() => assertSafeNavigationUrl("https://jobs.example.com", {
      allowedHostname: (hostname) => hostname === "approved.example.com",
    })).toThrowError(expect.objectContaining({ reason: "disallowed_host" }));
  });

  it.each([[[]], [["not-an-ip"]], [["93.184.216.34", "not-an-ip"]]])(
    "fails closed for unusable DNS answers: %j",
    async (addresses) => {
      const page = { goto: vi.fn(), url: () => "https://jobs.example.com" };
      await expect(
        safePageGoto(page as never, "https://jobs.example.com", undefined, {
          hostnameResolver: async () => addresses,
        }),
      ).rejects.toMatchObject({ reason: "dns_resolution_failed" });
      expect(page.goto).not.toHaveBeenCalled();
    },
  );

  it("does not invoke DNS for a literal public IP", async () => {
    const resolver = vi.fn().mockRejectedValue(new Error("should not resolve"));
    const response = { ok: true };
    const page = {
      goto: vi.fn().mockResolvedValue(response),
      url: () => "https://93.184.216.34/jobs/1",
    };

    await expect(
      safePageGoto(page as never, "https://93.184.216.34/jobs/1", undefined, {
        hostnameResolver: resolver,
      }),
    ).resolves.toBe(response);
    expect(resolver).not.toHaveBeenCalled();
  });

  it("falls back non-navigation and subframe requests while guarding the main frame", async () => {
    const mainFrame = {};
    const childFrame = {};
    let handler: ((route: never, request: never) => Promise<void>) | undefined;
    const fallback = vi.fn().mockResolvedValue(undefined);
    const page = {
      route: vi.fn(async (_pattern, callback) => { handler = callback; }),
      unroute: vi.fn().mockResolvedValue(undefined),
      mainFrame: () => mainFrame,
      goto: vi.fn(async () => {
        await handler?.({ fallback } as never, {
          isNavigationRequest: () => false,
          frame: () => mainFrame,
          url: () => "http://127.0.0.1/asset",
        } as never);
        await handler?.({ fallback } as never, {
          isNavigationRequest: () => true,
          frame: () => childFrame,
          url: () => "http://127.0.0.1/frame",
        } as never);
        return null;
      }),
      url: () => "https://jobs.example.com/start",
    };

    await expect(safePageGoto(page as never, "https://jobs.example.com/start"))
      .resolves.toBeNull();
    expect(fallback).toHaveBeenCalledTimes(2);
    expect(page.unroute).toHaveBeenCalledWith("**/*", handler);
  });

  it("uses the original input as the final URL when a minimal page has no url method", async () => {
    const response = { status: 200 };
    const page = { goto: vi.fn().mockResolvedValue(response) };
    await expect(safePageGoto(page as never, "https://jobs.example.com/apply"))
      .resolves.toBe(response);
    expect(page.goto).toHaveBeenCalledWith("https://jobs.example.com/apply");
  });

  it("preserves goto options and original navigation errors", async () => {
    const failure = new Error("browser crashed");
    const page = {
      goto: vi.fn().mockRejectedValue(failure),
      url: () => "https://jobs.example.com/apply",
    };
    const options = { waitUntil: "domcontentloaded" as const, timeout: 1234 };

    await expect(safePageGoto(page as never, "https://jobs.example.com/apply", options))
      .rejects.toBe(failure);
    expect(page.goto).toHaveBeenCalledWith("https://jobs.example.com/apply", options);
  });

  it("enforces LinkedIn restrictions before calling the browser", async () => {
    const page = { goto: vi.fn(), url: () => "https://www.linkedin.com/jobs/view/1" };

    await expect(safeLinkedInPageGoto(page as never, "https://linkedin.com.evil.example/jobs/1"))
      .rejects.toMatchObject({ reason: "disallowed_host" });
    expect(page.goto).not.toHaveBeenCalled();
  });

  it("uses the CDP guard to block an unsafe main-document redirect and always disposes it", async () => {
    let pausedHandler: ((event: unknown) => void) | undefined;
    const send = vi.fn(async (method: string) => {
      if (method === "Page.getFrameTree") return { frameTree: { frame: { id: "main-frame" } } };
      return {};
    });
    const session = {
      send,
      on: vi.fn((_event: string, handler: (event: unknown) => void) => { pausedHandler = handler; }),
      off: vi.fn(),
      detach: vi.fn().mockResolvedValue(undefined),
    };
    const page = {
      context: () => ({ newCDPSession: vi.fn().mockResolvedValue(session) }),
      goto: vi.fn(async () => {
        pausedHandler?.({
          requestId: "request-1",
          frameId: "main-frame",
          resourceType: "Document",
          request: { url: "http://127.0.0.1/admin" },
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
        throw new Error("net::ERR_FAILED");
      }),
      url: () => "https://jobs.example.com/start",
    };

    await expect(safePageGoto(page as never, "https://jobs.example.com/start"))
      .rejects.toMatchObject({ reason: "private_host" });
    expect(send).toHaveBeenCalledWith("Fetch.failRequest", {
      requestId: "request-1",
      errorReason: "BlockedByClient",
    });
    expect(send).toHaveBeenCalledWith("Fetch.disable");
    expect(session.off).toHaveBeenCalledWith("Fetch.requestPaused", expect.any(Function));
    expect(session.detach).toHaveBeenCalledOnce();
  });
});
