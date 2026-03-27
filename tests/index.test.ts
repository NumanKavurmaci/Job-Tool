import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadIndexModule() {
  vi.resetModules();
  const module = await import("../../src/index.js");
  const extractJobTextMock = vi.fn();
  const parseJobWithLLMMock = vi.fn();
  const withPageMock = vi.fn();
  const formatJobForLLMMock = vi.fn();
  const upsertMock = vi.fn();
  const disconnectMock = vi.fn();
  const infoMock = vi.fn();
  const errorMock = vi.fn();
  const exitMock = vi.fn();

  return {
    module,
    deps: {
      extractJobTextMock,
      parseJobWithLLMMock,
      withPageMock,
      formatJobForLLMMock,
      upsertMock,
      disconnectMock,
      infoMock,
      errorMock,
      exitMock,
    },
    runtimeDeps: {
      withPage: withPageMock,
      extractJobText: extractJobTextMock,
      formatJobForLLM: formatJobForLLMMock,
      parseJobWithLLM: parseJobWithLLMMock,
      prisma: {
        jobPosting: {
          upsert: upsertMock,
        },
        $disconnect: disconnectMock,
      },
      logger: {
        info: infoMock,
        error: errorMock,
      },
      exit: exitMock,
    },
  };
}

describe("index entrypoint", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("runs the main flow and saves the parsed job", async () => {
    const { module, deps, runtimeDeps } = await loadIndexModule();
    const extracted = {
      rawText: "Raw body",
      title: "Adapter Title",
      company: "Adapter Company",
      location: "Adapter Location",
      platform: "greenhouse",
      applyUrl: "https://apply.example.com",
      currentUrl: "https://jobs.example.com/1",
      descriptionText: "Description",
      requirementsText: "Requirements",
      benefitsText: "Benefits",
    };
    const parsed = {
      title: null,
      company: null,
      location: null,
      platform: null,
      seniority: "Senior",
      mustHaveSkills: ["TypeScript"],
      niceToHaveSkills: [],
      remoteType: "Remote",
    };
    const saved = { id: "job_1" };

    deps.withPageMock.mockImplementation(async (fn: (page: unknown) => Promise<unknown>) => {
      return fn({ fake: "page" });
    });
    deps.extractJobTextMock.mockResolvedValue(extracted);
    deps.formatJobForLLMMock.mockReturnValue("Formatted prompt");
    deps.parseJobWithLLMMock.mockResolvedValue(parsed);
    deps.upsertMock.mockResolvedValue(saved);

    const result = await module.main("https://jobs.example.com/1", runtimeDeps);

    expect(deps.withPageMock).toHaveBeenCalledTimes(1);
    expect(deps.extractJobTextMock).toHaveBeenCalledWith(
      { fake: "page" },
      "https://jobs.example.com/1",
    );
    expect(deps.formatJobForLLMMock).toHaveBeenCalledWith(extracted);
    expect(deps.parseJobWithLLMMock).toHaveBeenCalledWith("Formatted prompt");
    expect(deps.upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { url: "https://jobs.example.com/1" },
        update: expect.objectContaining({
          rawText: "Raw body",
          title: "Adapter Title",
          company: "Adapter Company",
          location: "Adapter Location",
          platform: "greenhouse",
        }),
      }),
    );
    expect(result).toBe(saved);
  });

  it("throws when no url is provided", async () => {
    const { module, runtimeDeps } = await loadIndexModule();
    await expect(module.main(undefined, runtimeDeps)).rejects.toThrow(
      "Usage: npm run dev -- <job-url>",
    );
  });

  it("runCli disconnects after success", async () => {
    const { module, deps, runtimeDeps } = await loadIndexModule();

    deps.withPageMock.mockImplementation(async (fn: (page: unknown) => Promise<unknown>) => {
      return fn({ fake: "page" });
    });
    deps.extractJobTextMock.mockResolvedValue({
      rawText: "Raw body",
      title: null,
      company: null,
      location: null,
      platform: "generic",
      applyUrl: null,
      currentUrl: "https://jobs.example.com/1",
      descriptionText: null,
      requirementsText: null,
      benefitsText: null,
    });
    deps.formatJobForLLMMock.mockReturnValue("Formatted prompt");
    deps.parseJobWithLLMMock.mockResolvedValue({
      title: null,
      company: null,
      location: null,
      platform: null,
      seniority: null,
      mustHaveSkills: [],
      niceToHaveSkills: [],
      remoteType: null,
    });
    deps.upsertMock.mockResolvedValue({ id: "job_2" });

    const originalArgv = process.argv;
    process.argv = ["node", "src/index.ts", "https://jobs.example.com/1"];

    await module.runCli(runtimeDeps);

    expect(deps.disconnectMock).toHaveBeenCalledTimes(1);
    expect(deps.exitMock).not.toHaveBeenCalled();
    process.argv = originalArgv;
  });

  it("runCli logs errors, exits, and still disconnects", async () => {
    const { module, deps, runtimeDeps } = await loadIndexModule();
    deps.withPageMock.mockRejectedValue(new Error("fetch failed"));
    deps.exitMock.mockImplementation(() => {
      throw new Error("exit:1");
    });

    await expect(module.runCli(runtimeDeps)).rejects.toThrow("exit:1");
    expect(deps.errorMock).toHaveBeenCalledTimes(1);
    expect(deps.disconnectMock).toHaveBeenCalledTimes(1);
  });
});
