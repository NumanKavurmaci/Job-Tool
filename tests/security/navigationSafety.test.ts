import { describe, expect, it, vi } from "vitest";
import {
  assertSafeLinkedInNavigationUrl,
  assertSafeNavigationUrl,
  safePageGoto,
  UnsafeNavigationUrlError,
} from "../../src/security/navigationSafety.js";

describe("navigation safety", () => {
  it("accepts public http(s) URLs", () => {
    expect(assertSafeNavigationUrl("https://example.com/jobs/1").hostname).toBe("example.com");
    expect(assertSafeNavigationUrl("http://8.8.8.8/jobs/1").hostname).toBe("8.8.8.8");
  });

  it.each([
    "file:///etc/passwd",
    "javascript:alert(1)",
    "ftp://example.com/file",
    "not-a-url",
  ])("rejects unsupported or invalid URL %s", (url) => {
    expect(() => assertSafeNavigationUrl(url)).toThrow(UnsafeNavigationUrlError);
  });

  it.each([
    "https://user@example.com/jobs/1",
    "https://user:secret@example.com/jobs/1",
  ])("rejects URL credentials in %s", (url) => {
    expect(() => assertSafeNavigationUrl(url)).toThrow(UnsafeNavigationUrlError);
  });

  it("does not echo URL credentials or query tokens in the security error", () => {
    let thrown: unknown;
    try {
      assertSafeNavigationUrl(
        "https://user@example.com:secret@apply.example.com/form?token=top-secret",
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UnsafeNavigationUrlError);
    expect(JSON.stringify(thrown)).not.toContain("user@example.com");
    expect(JSON.stringify(thrown)).not.toContain("top-secret");
    expect(JSON.stringify(thrown)).not.toContain(":secret");
  });

  it.each([
    "http://localhost/apply",
    "http://jobs.localhost/apply",
    "http://internal/apply",
    "http://service.internal/apply",
    "http://metadata.google.internal/computeMetadata/v1/",
    "http://127.0.0.1/apply",
    "http://127.1/apply",
    "http://2130706433/apply",
    "http://0x7f000001/apply",
    "http://10.0.0.1/apply",
    "http://100.100.100.200/latest/meta-data/",
    "http://169.254.169.254/latest/meta-data/",
    "http://172.20.0.1/apply",
    "http://192.168.1.1/apply",
    "http://168.63.129.16/metadata/instance",
    "http://[::]/apply",
    "http://[::1]/apply",
    "http://[fe80::1]/apply",
    "http://[fd00:ec2::254]/latest/meta-data/",
    "http://[::ffff:127.0.0.1]/apply",
    "http://[2002:7f00:0001::]/apply",
  ])("rejects local, private, link-local, or metadata target %s", (url) => {
    expect(() => assertSafeNavigationUrl(url)).toThrow(UnsafeNavigationUrlError);
  });

  it("allows private hosts only through the explicit test option", () => {
    expect(
      assertSafeNavigationUrl("http://127.0.0.1:4173/apply", {
        allowPrivateHosts: true,
      }).hostname,
    ).toBe("127.0.0.1");

    expect(() =>
      assertSafeNavigationUrl("file:///tmp/form", { allowPrivateHosts: true }),
    ).toThrow(UnsafeNavigationUrlError);
    expect(() =>
      assertSafeNavigationUrl("http://user:secret@127.0.0.1/form", {
        allowPrivateHosts: true,
      }),
    ).toThrow(UnsafeNavigationUrlError);
  });

  it("checks every injected DNS answer and fails closed before navigation", async () => {
    const goto = vi.fn().mockResolvedValue(null);
    const page = {
      goto,
      url: () => "https://apply.example.com/start",
    };

    await expect(
      safePageGoto(page as never, "https://apply.example.com/start", undefined, {
        hostnameResolver: async () => ["93.184.216.34", "10.20.30.40"],
      }),
    ).rejects.toMatchObject({ reason: "private_host" });
    expect(goto).not.toHaveBeenCalled();

    await expect(
      safePageGoto(page as never, "https://apply.example.com/start", undefined, {
        hostnameResolver: async () => {
          throw new Error("NXDOMAIN");
        },
      }),
    ).rejects.toMatchObject({ reason: "dns_resolution_failed" });
    expect(goto).not.toHaveBeenCalled();
  });

  it("uses the injected resolver for public hosts and bypasses it only for private test fixtures", async () => {
    const publicPage = {
      goto: vi.fn().mockResolvedValue(null),
      url: () => "https://apply.example.com/start",
    };
    const publicResolver = vi.fn().mockResolvedValue(["93.184.216.34"]);
    await expect(
      safePageGoto(publicPage as never, "https://apply.example.com/start", undefined, {
        hostnameResolver: publicResolver,
      }),
    ).resolves.toBeNull();
    expect(publicResolver).toHaveBeenCalledWith("apply.example.com");

    const localPage = {
      goto: vi.fn().mockResolvedValue(null),
      url: () => "http://127.0.0.1:4173/form",
    };
    const localResolver = vi.fn().mockRejectedValue(new Error("must not resolve"));
    await expect(
      safePageGoto(localPage as never, "http://127.0.0.1:4173/form", undefined, {
        allowPrivateHosts: true,
        hostnameResolver: localResolver,
      }),
    ).resolves.toBeNull();
    expect(localResolver).not.toHaveBeenCalled();
  });

  it("allows only HTTPS LinkedIn and its real subdomains", () => {
    expect(assertSafeLinkedInNavigationUrl("https://linkedin.com/jobs/view/1").hostname).toBe(
      "linkedin.com",
    );
    expect(
      assertSafeLinkedInNavigationUrl("https://www.linkedin.com/jobs/view/1").hostname,
    ).toBe("www.linkedin.com");

    for (const url of [
      "http://www.linkedin.com/jobs/view/1",
      "https://linkedin.com.evil.test/jobs/view/1",
      "https://evil-linkedin.com/jobs/view/1",
      "https://user:secret@www.linkedin.com/jobs/view/1",
      "https://www.linkedin.com:444/jobs/view/1",
    ]) {
      expect(() => assertSafeLinkedInNavigationUrl(url)).toThrow(UnsafeNavigationUrlError);
    }
  });

  it("rejects a private final URL even without redirect interception support", async () => {
    const page = {
      goto: vi.fn().mockResolvedValue(null),
      url: vi.fn().mockReturnValue("http://169.254.169.254/latest/meta-data/"),
    };

    await expect(
      safePageGoto(page as never, "https://apply.example.com/start"),
    ).rejects.toMatchObject({ reason: "private_host" });
  });

  it("aborts an unsafe main-frame redirect before it can load", async () => {
    const mainFrame = {};
    let handler:
      | ((route: Record<string, unknown>, request: Record<string, unknown>) => Promise<void>)
      | undefined;
    const route = {
      fallback: vi.fn(),
      abort: vi.fn().mockResolvedValue(undefined),
    };
    const request = {
      isNavigationRequest: () => true,
      frame: () => mainFrame,
      url: () => "http://127.0.0.1/admin",
    };
    const page = {
      route: vi.fn(async (_pattern, nextHandler) => {
        handler = nextHandler;
      }),
      unroute: vi.fn().mockResolvedValue(undefined),
      mainFrame: () => mainFrame,
      goto: vi.fn(async () => {
        await handler?.(route, request);
        throw new Error("net::ERR_BLOCKED_BY_CLIENT");
      }),
      url: () => "https://apply.example.com/start",
    };

    await expect(
      safePageGoto(page as never, "https://apply.example.com/start"),
    ).rejects.toMatchObject({ reason: "private_host" });
    expect(route.abort).toHaveBeenCalledWith("blockedbyclient");
    expect(route.fallback).not.toHaveBeenCalled();
    expect(page.unroute).toHaveBeenCalledTimes(1);
  });
});
