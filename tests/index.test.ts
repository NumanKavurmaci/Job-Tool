import { describe, expect, it } from "vitest";
import { appDeps, main, parseCliArgs, runCli } from "../src/index.js";

describe("index entrypoint", () => {
  it("re-exports the public app surface", () => {
    expect(typeof parseCliArgs).toBe("function");
    expect(typeof main).toBe("function");
    expect(typeof runCli).toBe("function");
    expect(typeof appDeps.withPage).toBe("function");
  });
});
