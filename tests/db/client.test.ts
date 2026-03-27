import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaClientMock = vi.fn();
const PrismaClientMock = vi.fn(function PrismaClientMock(this: object) {
  return prismaClientMock();
});

vi.mock("@prisma/client", () => ({
  PrismaClient: PrismaClientMock,
}));

describe("db client", () => {
  beforeEach(() => {
    vi.resetModules();
    prismaClientMock.mockReset();
    PrismaClientMock.mockClear();
  });

  it("creates a Prisma client instance", async () => {
    const instance = { marker: "prisma" };
    prismaClientMock.mockImplementation(() => instance);

    const module = await import("../../src/db/client.js");

    expect(PrismaClientMock).toHaveBeenCalledTimes(1);
    expect(module.prisma).toBe(instance);
  });
});
