import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/db/client.js";

describe("db client runtime", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("can execute a real query against the configured local database", async () => {
    const result = await prisma.$queryRaw<Array<{ ok: bigint }>>`SELECT 1 as ok`;

    expect(result[0]?.ok).toBe(1n);
  });
});
