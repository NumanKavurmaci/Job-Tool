import { describe, expect, it } from "vitest";
import { GenericAdapter } from "../../src/adapters/GenericAdapter.js";
import { GreenhouseAdapter } from "../../src/adapters/GreenhouseAdapter.js";
import { LeverAdapter } from "../../src/adapters/LeverAdapter.js";
import { resolveAdapter } from "../../src/adapters/resolveAdapter.js";

describe("resolveAdapter", () => {
  it("resolves Greenhouse urls", () => {
    expect(resolveAdapter("https://boards.greenhouse.io/company/jobs/123")).toBeInstanceOf(
      GreenhouseAdapter,
    );
  });

  it("resolves Lever urls", () => {
    expect(resolveAdapter("https://jobs.lever.co/company/123")).toBeInstanceOf(LeverAdapter);
  });

  it("falls back to the generic adapter", () => {
    expect(resolveAdapter("https://company.example.com/careers/role")).toBeInstanceOf(
      GenericAdapter,
    );
  });

  it("uses the generic adapter for linkedin urls until a dedicated adapter exists", () => {
    expect(resolveAdapter("https://www.linkedin.com/jobs/view/1234567890/")).toBeInstanceOf(
      GenericAdapter,
    );
  });
});
