import { afterEach, describe, expect, it, vi } from "vitest";
import { appDeps, main, parseCliArgs, runCli } from "../src/index.js";

describe("index entrypoint", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("../src/app/main.js");
  });

  it("re-exports the public app surface", () => {
    expect(typeof parseCliArgs).toBe("function");
    expect(typeof main).toBe("function");
    expect(typeof runCli).toBe("function");
    expect(typeof appDeps.withPage).toBe("function");
  });
});
