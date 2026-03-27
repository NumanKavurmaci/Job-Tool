import { describe, expect, it, vi } from "vitest";
import {
  compactText,
  extractBodyText,
  extractSectionText,
  getAttributeBySelectors,
  getCurrentUrl,
  getTextBySelectors,
  gotoJobPage,
  optionalText,
} from "../../src/adapters/helpers.js";
import { createMockPage } from "../utils/fakePage.js";

describe("adapter helpers", () => {
  it("compacts whitespace and strips extra blank lines", () => {
    expect(compactText("  hello \r\n\n\nworld\t ")).toBe("hello \n\nworld");
  });

  it("returns empty string for missing compact text", () => {
    expect(compactText(undefined)).toBe("");
  });

  it("returns normalized optional text", () => {
    expect(optionalText("  value\t\t")).toBe("value");
  });

  it("returns null for empty optional text", () => {
    expect(optionalText("   ")).toBeNull();
  });

  it("gets the first matching selector text", async () => {
    const page = createMockPage({
      selectors: {
        ".missing": { count: 0 },
        ".found": { text: " Selected text " },
      },
    });

    await expect(getTextBySelectors(page as never, [".missing", ".found"])).resolves.toBe(
      "Selected text",
    );
  });

  it("returns null when no selector text is available", async () => {
    const page = createMockPage({
      selectors: {
        ".blank": { text: "   " },
      },
    });

    await expect(getTextBySelectors(page as never, [".blank", ".other"])).resolves.toBeNull();
  });

  it("gets the first matching selector attribute", async () => {
    const page = createMockPage({
      selectors: {
        ".apply": { attributes: { href: "https://apply.example.com" } },
      },
    });

    await expect(
      getAttributeBySelectors(page as never, [".apply"], "href"),
    ).resolves.toBe("https://apply.example.com");
  });

  it("returns null when attribute lookup fails", async () => {
    const page = createMockPage({
      selectors: {
        ".apply": { throwsOnGetAttribute: true },
      },
    });

    await expect(
      getAttributeBySelectors(page as never, [".apply"], "href"),
    ).resolves.toBeNull();
  });

  it("extracts section text from the first populated section", async () => {
    const page = createMockPage({
      selectors: {
        ".section-a": { text: " " },
        ".section-b": { text: "Requirements text" },
      },
    });

    await expect(
      extractSectionText(page as never, [".section-a", ".section-b"]),
    ).resolves.toBe("Requirements text");
  });

  it("extracts and compacts body text", async () => {
    const page = createMockPage({
      selectors: {
        body: { text: "Line 1\n\n\nLine 2" },
      },
    });

    await expect(extractBodyText(page as never)).resolves.toBe("Line 1\n\nLine 2");
  });

  it("returns the current page url", async () => {
    const page = createMockPage({
      currentUrl: "https://jobs.example.com/role",
    });

    await expect(getCurrentUrl(page as never)).resolves.toBe("https://jobs.example.com/role");
  });

  it("navigates to the page and waits", async () => {
    const page = createMockPage();
    const gotoSpy = vi.spyOn(page, "goto");
    const waitSpy = vi.spyOn(page, "waitForTimeout");

    await gotoJobPage(page as never, "https://jobs.example.com/role");

    expect(gotoSpy).toHaveBeenCalledWith("https://jobs.example.com/role", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    expect(waitSpy).toHaveBeenCalledWith(2_000);
  });
});
