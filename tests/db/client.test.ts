import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/db/client.js";
import { assertPrismaRuntimeReady } from "../../src/db/runtimeGuard.js";

describe("db client runtime", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("verifies Prisma runtime readiness before using the shared client", async () => {
    expect(() => assertPrismaRuntimeReady()).not.toThrow();
    expect(typeof prisma.$disconnect).toBe("function");
  });
});
