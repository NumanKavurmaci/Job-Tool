import { afterEach, describe, expect, it, vi } from "vitest";

describe("app constants", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("node:fs");
    vi.doUnmock("../../src/config/env.js");
  });

  it("parses linkedin collection and current job ids safely", async () => {
    const module = await import("../../src/app/constants.js");

    expect(
      module.isLinkedInCollectionUrl("https://www.linkedin.com/jobs/collections/recommended"),
    ).toBe(true);
    expect(module.isLinkedInCollectionUrl("https://example.com/jobs/collections/recommended")).toBe(
      false,
    );
    expect(
      module.getLinkedInCurrentJobId(
        "https://www.linkedin.com/jobs/search/?currentJobId=4403208488&keywords=test",
      ),
    ).toBe("4403208488");
    expect(
      module.getLinkedInCurrentJobId(
        "https://www.linkedin.com/jobs/search/?currentJobId=abc&keywords=test",
      ),
    ).toBeNull();
    expect(
      module.getLinkedInCurrentJobId(
        "https://jobs.example.com/search/?currentJobId=4403208488&keywords=test",
      ),
    ).toBeNull();
    expect(module.getLinkedInCurrentJobId("not-a-valid-url")).toBeNull();
    expect(
      module.resolveLinkedInSingleJobUrl(
        "https://www.linkedin.com/jobs/search/?currentJobId=4403208488&keywords=test",
      ),
    ).toBe("https://www.linkedin.com/jobs/view/4403208488/");
    expect(module.resolveLinkedInSingleJobUrl("https://example.com/jobs/1")).toBe(
      "https://example.com/jobs/1",
    );
  });

  it("prefers the highest-value resume candidate inside the user directory", async () => {
    vi.doMock("node:fs", () => ({
      existsSync: vi.fn((target: string) => target.endsWith("\\user") || target.endsWith("/user")),
      readdirSync: vi.fn((target: string) => {
        if (target.endsWith("\\user") || target.endsWith("/user")) {
          return ["notes.txt", "resume.md", "resume.pdf", "cv.docx"];
        }

        return [];
      }),
    }));
    vi.doMock("../../src/config/env.js", () => ({
      env: {
        LINKEDIN_BROWSER_PROFILE_PATH: "./.linkedin-profile",
        LINKEDIN_SESSION_STATE_PATH: "./.linkedin-session.json",
      },
    }));

    const module = await import("../../src/app/constants.js");

    expect(module.DEFAULT_RESUME_PATH?.replace(/\\/g, "/")).toBe("user/resume.pdf");
    expect(module.LINKEDIN_BROWSER_SESSION_OPTIONS).toEqual({
      persistentProfilePath: "./.linkedin-profile",
      storageStatePath: "./.linkedin-session.json",
      persistStorageState: true,
    });
  });

  it("falls back to a root-level resume file or undefined when no user directory match exists", async () => {
    const readdirSyncMock = vi
      .fn()
      .mockImplementationOnce(() => ["cover-letter.md", "portfolio.txt"]);

    vi.doMock("node:fs", () => ({
      existsSync: vi.fn(() => false),
      readdirSync: readdirSyncMock,
    }));
    vi.doMock("../../src/config/env.js", () => ({
      env: {
        LINKEDIN_BROWSER_PROFILE_PATH: "./.linkedin-profile",
        LINKEDIN_SESSION_STATE_PATH: "./.linkedin-session.json",
      },
    }));

    const moduleWithRootFallback = await import("../../src/app/constants.js?root-fallback");
    expect(moduleWithRootFallback.DEFAULT_RESUME_PATH).toBe("cover-letter.md");

    vi.resetModules();
    vi.doMock("node:fs", () => ({
      existsSync: vi.fn(() => false),
      readdirSync: vi.fn(() => ["package.json", "tsconfig.json"]),
    }));
    vi.doMock("../../src/config/env.js", () => ({
      env: {
        LINKEDIN_BROWSER_PROFILE_PATH: "./.linkedin-profile",
        LINKEDIN_SESSION_STATE_PATH: "./.linkedin-session.json",
      },
    }));

    const moduleWithoutMatches = await import("../../src/app/constants.js?no-fallback");
    expect(moduleWithoutMatches.DEFAULT_RESUME_PATH).toBeUndefined();
  });
});
