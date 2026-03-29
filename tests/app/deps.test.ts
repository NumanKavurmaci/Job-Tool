import { describe, expect, it, vi } from "vitest";

describe("app deps", () => {
  it("creates the Playwright easy apply driver through the lazy import", async () => {
    vi.resetModules();

    const driverConstructor = vi.fn(function Driver(this: Record<string, unknown>, page: unknown) {
      this.page = page;
    });

    vi.doMock("../../src/linkedin/playwrightEasyApplyDriver.js", () => ({
      PlaywrightLinkedInEasyApplyDriver: driverConstructor,
    }));

    const { appDeps } = await import("../../src/app/deps.js");
    const page = { fake: "page" };

    const driver = await appDeps.createEasyApplyDriver(page);

    expect(driverConstructor).toHaveBeenCalledWith(page);
    expect(driver).toMatchObject({ page });
  });

  it("exposes an exit helper that delegates to process.exit", async () => {
    vi.resetModules();
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as any);
    const { appDeps } = await import("../../src/app/deps.js");

    appDeps.exit(7);

    expect(exitSpy).toHaveBeenCalledWith(7);
    exitSpy.mockRestore();
  });
});
