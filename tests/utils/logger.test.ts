import { describe, expect, it } from "vitest";
import { logger } from "../../src/utils/logger.js";

describe("logger", () => {
  it("creates a logger with info level", () => {
    expect(logger.level).toBe("info");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.error).toBe("function");
  });
});
