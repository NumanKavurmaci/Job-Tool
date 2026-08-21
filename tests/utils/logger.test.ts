import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("logger", () => {
  beforeEach(() => {
    vi.stubEnv("JOB_TOOL_RUN_ID", "");
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("creates a logger with info level", async () => {
    const { logger } = await import("../../src/utils/logger.js");

    expect(logger.level).toBe("info");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
  });

  it("adds the dashboard run id to structured log base bindings", async () => {
    vi.stubEnv("JOB_TOOL_RUN_ID", "dashboard-run-123");
    const { logger } = await import("../../src/utils/logger.js");

    expect(logger.bindings()).toMatchObject({
      dashboardRunId: "dashboard-run-123",
    });
  });
});
