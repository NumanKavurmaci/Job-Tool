import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const runCli = vi.fn(async () => undefined);

vi.mock("../src/app/main.js", () => ({
  main: vi.fn(),
  runCli,
}));

vi.mock("../src/app/deps.js", () => ({
  appDeps: {},
}));

vi.mock("../src/app/cli.js", () => ({
  parseCliArgs: vi.fn(),
}));

vi.mock("../src/dashboard/loadDashboardSnapshot.js", () => ({
  formatDashboardSummary: vi.fn(),
  loadDashboardSnapshot: vi.fn(),
}));

const indexPath = fileURLToPath(new URL("../src/index.ts", import.meta.url));

async function importFreshIndex() {
  vi.resetModules();
  await import("../src/index.ts");
}

describe("package entrypoint", () => {
  const originalArgv = process.argv;

  afterEach(() => {
    process.argv = originalArgv;
    runCli.mockClear();
  });

  it("runs the CLI when invoked as the process entrypoint", async () => {
    process.argv = ["node", indexPath];

    await importFreshIndex();

    expect(runCli).toHaveBeenCalledTimes(1);
  });

  it("does not run the CLI when imported as a module", async () => {
    process.argv = ["node", path.join(path.dirname(indexPath), "other.ts")];

    await importFreshIndex();

    expect(runCli).not.toHaveBeenCalled();
  });
});
