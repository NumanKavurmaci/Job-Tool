import { describe, expect, it, vi } from "vitest";
import {
  assertPrismaRuntimeReady,
  hasLocalPrismaQueryEngine,
  isLocalDatabaseUrl,
} from "../../src/db/runtimeGuard.js";

describe("prisma runtime guard", () => {
  it("treats file-backed URLs as local databases", () => {
    expect(isLocalDatabaseUrl("file:./dev.db")).toBe(true);
    expect(isLocalDatabaseUrl("sqlite:./dev.db")).toBe(true);
    expect(isLocalDatabaseUrl("prisma://accelerate")).toBe(false);
    expect(isLocalDatabaseUrl(undefined)).toBe(false);
  });

  it("detects a copied local Prisma engine in the generated client directory", () => {
    const readdirSync = vi.fn(() => [
      { isFile: () => true, name: "query_engine-windows.dll.node" },
    ]);

    expect(
      hasLocalPrismaQueryEngine("C:/repo/node_modules/.prisma/client", readdirSync as never),
    ).toBe(true);
  });

  it("throws a clear app error when a local database is configured without a local engine", () => {
    expect(() =>
      assertPrismaRuntimeReady({
        databaseUrl: "file:./dev.db",
        clientDir: "C:/repo/node_modules/.prisma/client",
        readdirSync: vi.fn(() => [] as never[]),
      }),
    ).toThrowError(/missing a local query engine/i);
  });

  it("does not block non-local datasource URLs", () => {
    expect(() =>
      assertPrismaRuntimeReady({
        databaseUrl: "prisma://accelerate.example",
        clientDir: "C:/repo/node_modules/.prisma/client",
        readdirSync: vi.fn(() => [] as never[]),
      }),
    ).not.toThrow();
  });
});
