import { describe, expect, it, vi } from "vitest";

vi.mock("../../../src/answers/resolveAnswer.js", () => ({
  resolveAnswer: vi.fn(async ({ question }: { question: { label: string } }) => ({
    questionType: "general_short_text",
    strategy: "deterministic",
    answer: question.label.includes("salary") ? "1500000" : "Yes",
    confidence: 0.95,
    confidenceLabel: "high",
    source: "candidate-profile",
  })),
}));

import {
  runExternalApplyDryRunFlow,
  runExternalApplyFlow,
} from "../../../src/app/flows/externalApplyFlows.js";

function buildCandidateProfile() {
  return {
    fullName: "Jane Doe",
    linkedinUrl: "https://linkedin.com/in/jane",
    sourceMetadata: { resumePath: "./user/resume.pdf" },
    email: "jane@example.com",
    phone: null,
    location: null,
    githubUrl: null,
    portfolioUrl: null,
    summary: null,
    gpa: null,
    yearsOfExperienceTotal: 4,
    currentTitle: null,
    preferredRoles: [],
    preferredTechStack: [],
    skills: [],
    languages: [],
    salaryExpectations: { usd: null, eur: null, try: "1500000" },
    salaryExpectation: null,
    experienceOverrides: {},
    workAuthorization: null,
    requiresSponsorship: null,
    willingToRelocate: null,
    remotePreference: null,
    remoteOnly: false,
    disability: {
      hasVisualDisability: false,
      disabilityPercentage: null,
      requiresAccommodation: null,
      accommodationNotes: null,
      disclosurePreference: "manual-review",
    },
    education: [],
    experience: [],
    projects: [],
    resumeText: "",
  };
}

function createFlowPage(args: {
  evaluate: ReturnType<typeof vi.fn>;
  visibleSelectors?: string[];
  goto?: ReturnType<typeof vi.fn>;
}) {
  const visibleSelectors = new Set(args.visibleSelectors ?? []);
  const goto = args.goto ?? vi.fn();

  return {
    goto,
    evaluate(callback: unknown, ...rest: unknown[]) {
      if (typeof callback === "function") {
        return Promise.resolve([]);
      }
      return args.evaluate(callback as never, ...(rest as never[]));
    },
    waitForTimeout: vi.fn(async () => undefined),
    locator(selector: string) {
      return {
        first() {
          return this;
        },
        async count() {
          return visibleSelectors.has(selector) ? 1 : 0;
        },
        async click() {
          return undefined;
        },
        async fill() {
          return undefined;
        },
        async press() {
          return undefined;
        },
        async blur() {
          return undefined;
        },
        async setInputFiles() {
          return undefined;
        },
      };
    },
  };
}

describe("external apply flows", () => {
  it("follows an AI-recommended precursor link and returns a dry-run answer plan", async () => {
    const goto = vi.fn();
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce({
        url: "https://example.com/start",
        title: "Apply now",
        fields: [],
        precursorLinks: [{ label: "Start application", href: "https://example.com/form" }],
      })
      .mockResolvedValueOnce("This is a precursor page with a start application link.")
      .mockResolvedValueOnce({
        url: "https://example.com/form",
        title: "Backend Engineer Application",
        fields: [
          {
            key: "salary",
            label: "What is your salary expectation (TRY)?",
            inputType: "number",
            required: true,
            options: [],
            placeholder: null,
            helpText: null,
            accept: null,
          },
          {
            key: "resume",
            label: "Upload your resume (only pdf)",
            inputType: "file",
            required: true,
            options: [],
            placeholder: null,
            helpText: null,
            accept: ".pdf",
          },
        ],
        precursorLinks: [],
      })
      .mockResolvedValueOnce("This is the actual application form.");

    const deps = {
      loadCandidateMasterProfile: vi.fn().mockResolvedValue(buildCandidateProfile()),
      prisma: {
        candidateProfileSnapshot: {
          create: vi.fn().mockResolvedValue({ id: "snapshot_1" }),
        },
        preparedAnswerSet: {
          create: vi.fn().mockResolvedValue({ id: "prepared_1" }),
        },
        systemLog: {
          create: vi.fn().mockResolvedValue({}),
        },
      },
      withPage: vi.fn(async (fn: (page: unknown) => Promise<unknown>) =>
        fn(
          createFlowPage({
            goto,
            evaluate,
            visibleSelectors: [`[id="salary"]`, `[id="resume"]`],
          }),
        )),
      completePrompt: vi.fn().mockResolvedValue({
        text: "FOLLOW: https://example.com/form",
        provider: "local",
        model: "openai/gpt-oss-20b",
      }),
      writeRunReport: vi.fn().mockResolvedValue("artifacts/external-apply-runs/report.json"),
      logger: {
        info: vi.fn(),
        error: vi.fn(),
      },
    } as any;

    const result = await runExternalApplyDryRunFlow(
      {
        mode: "external-apply",
        url: "https://example.com/start",
        resumePath: "./user/resume.pdf",
        dryRun: true,
      },
      deps,
    );

    expect(result.discovery.followedPrecursorLink).toBe("https://example.com/form");
    expect(result.discovery.fields).toHaveLength(2);
    expect(result.answerPlan).toEqual([
      expect.objectContaining({
        fieldKey: "salary",
        answer: "1500000",
      }),
      expect.objectContaining({
        fieldKey: "resume",
        answer: "./user/resume.pdf",
      }),
    ]);
    expect(result.aiAdvisory).toEqual(
      expect.objectContaining({
        text: "FOLLOW: https://example.com/form",
      }),
    );
    expect(deps.writeRunReport).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "external-apply-runs",
        prefix: "external-apply-dry-run",
      }),
    );
    expect(deps.prisma.candidateProfileSnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fullName: "Jane Doe",
        linkedinUrl: "https://linkedin.com/in/jane",
        resumePath: "./user/resume.pdf",
      }),
    });
    expect(deps.prisma.preparedAnswerSet.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        candidateProfileId: "snapshot_1",
      }),
    });
    expect(result.preparedAnswerSets).toEqual([{ id: "prepared_1" }]);
  });

  it("keeps the bot on the current page when AI explicitly says STAY", async () => {
    const goto = vi.fn();
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce({
        url: "https://example.com/start",
        title: "External Application Landing",
        fields: [],
        precursorLinks: [{ label: "Apply now", href: "https://example.com/form" }],
      })
      .mockResolvedValueOnce("Landing page that explains the process but does not contain form fields yet.")
      .mockResolvedValueOnce("Landing page that explains the process but does not contain form fields yet.");

    const deps = {
      loadCandidateMasterProfile: vi.fn().mockResolvedValue(buildCandidateProfile()),
      prisma: {
        candidateProfileSnapshot: {
          create: vi.fn().mockResolvedValue({ id: "snapshot_1" }),
        },
        preparedAnswerSet: {
          create: vi.fn().mockResolvedValue({ id: "prepared_1" }),
        },
        systemLog: {
          create: vi.fn().mockResolvedValue({}),
        },
      },
      withPage: vi.fn(async (fn: (page: unknown) => Promise<unknown>) =>
        fn(
          createFlowPage({
            goto,
            evaluate,
          }),
        )),
      completePrompt: vi.fn().mockResolvedValue({
        text: "STAY",
        provider: "local",
        model: "openai/gpt-oss-20b",
      }),
      writeRunReport: vi.fn().mockResolvedValue("artifacts/external-apply-runs/report.json"),
      logger: {
        info: vi.fn(),
        error: vi.fn(),
      },
    } as any;

    const result = await runExternalApplyDryRunFlow(
      {
        mode: "external-apply",
        url: "https://example.com/start",
        resumePath: "./user/resume.pdf",
        dryRun: true,
      },
      deps,
    );

    expect(result.recommendedAction).toBe("stay");
    expect(result.discovery.followedPrecursorLink).toBeNull();
    expect(goto).toHaveBeenCalledTimes(1);
    expect(result.aiAdvisory).toEqual(
      expect.objectContaining({
        text: "STAY",
      }),
    );
    expect(deps.prisma.preparedAnswerSet.create).not.toHaveBeenCalled();
  });

  it("falls back to the first discovered precursor link when AI advice is invalid or unavailable", async () => {
    const goto = vi.fn();
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce({
        url: "https://example.com/start",
        title: "Apply entry point",
        fields: [],
        precursorLinks: [
          { label: "Begin application", href: "https://example.com/form" },
          { label: "Learn more", href: "https://example.com/about" },
        ],
      })
      .mockResolvedValueOnce("Entry page with two links and no direct fields.")
      .mockResolvedValueOnce({
        url: "https://example.com/form",
        title: "Application form",
        fields: [
          {
            key: "salary",
            label: "Expected salary",
            inputType: "number",
            required: true,
            options: [],
            placeholder: null,
            helpText: null,
            accept: null,
          },
        ],
        precursorLinks: [],
      })
      .mockResolvedValueOnce("Actual application form");

    const deps = {
      loadCandidateMasterProfile: vi.fn().mockResolvedValue(buildCandidateProfile()),
      prisma: {
        candidateProfileSnapshot: {
          create: vi.fn().mockResolvedValue({ id: "snapshot_1" }),
        },
        preparedAnswerSet: {
          create: vi.fn().mockResolvedValue({ id: "prepared_1" }),
        },
        systemLog: {
          create: vi.fn().mockResolvedValue({}),
        },
      },
      withPage: vi.fn(async (fn: (page: unknown) => Promise<unknown>) =>
        fn(
          createFlowPage({
            goto,
            evaluate,
            visibleSelectors: [`[id="salary"]`],
          }),
        )),
      completePrompt: vi.fn().mockRejectedValue(new Error("LLM unavailable")),
      writeRunReport: vi.fn().mockResolvedValue("artifacts/external-apply-runs/report.json"),
      logger: {
        info: vi.fn(),
        error: vi.fn(),
      },
    } as any;

    const result = await runExternalApplyDryRunFlow(
      {
        mode: "external-apply",
        url: "https://example.com/start",
        resumePath: "./user/resume.pdf",
        dryRun: true,
      },
      deps,
    );

    expect(result.recommendedAction).toBe("follow");
    expect(result.discovery.followedPrecursorLink).toBe("https://example.com/form");
    expect(result.aiAdvisory).toBeNull();
    expect(deps.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl: "https://example.com/start",
      }),
      "AI precursor recommendation failed; falling back to the first discovered link",
    );
    expect(deps.prisma.preparedAnswerSet.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        candidateProfileId: "snapshot_1",
      }),
    });
  });

  it("submits when running external-apply and records the live run type", async () => {
    const goto = vi.fn();
    const evaluate = vi.fn();
    evaluate
      .mockResolvedValueOnce({
        url: "https://example.com/form",
        title: "Application form",
        fields: [
          {
            key: "salary",
            label: "Expected salary",
            inputType: "number",
            required: true,
            options: [],
            placeholder: null,
            helpText: null,
            accept: null,
          },
        ],
        precursorLinks: [],
      })
      .mockResolvedValueOnce("Actual application form")
      .mockResolvedValueOnce({
        url: "https://example.com/form/complete",
        title: "Application complete",
        fields: [],
        precursorLinks: [],
      })
      .mockResolvedValueOnce({
        url: "https://example.com/form/complete",
        title: "Application complete",
        fields: [],
        precursorLinks: [],
      })
      .mockResolvedValueOnce("Thank you for applying!");

    const deps = {
      loadCandidateMasterProfile: vi.fn().mockResolvedValue(buildCandidateProfile()),
      prisma: {
        candidateProfileSnapshot: {
          create: vi.fn().mockResolvedValue({ id: "snapshot_1" }),
        },
        preparedAnswerSet: {
          create: vi.fn().mockResolvedValue({ id: "prepared_1" }),
        },
        systemLog: {
          create: vi.fn().mockResolvedValue({}),
        },
      },
      withPage: vi.fn(async (fn: (page: unknown) => Promise<unknown>) =>
        fn(
          createFlowPage({
            goto,
            evaluate,
            visibleSelectors: [`[id="salary"]`, `button:has-text("Submit")`],
          }),
        )),
      completePrompt: vi.fn(),
      writeRunReport: vi.fn().mockResolvedValue("artifacts/external-apply-runs/report.json"),
      logger: {
        info: vi.fn(),
        error: vi.fn(),
      },
    } as any;

    const result = await runExternalApplyFlow(
      {
        mode: "external-apply",
        url: "https://example.com/form",
        resumePath: "./user/resume.pdf",
        dryRun: false,
      },
      deps,
    );

    expect(result.finalStage).toBe("completed");
    expect(result.stopReason).toContain("Submitted");
    expect(deps.prisma.preparedAnswerSet.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        candidateProfileId: "snapshot_1",
        answersJson: expect.stringContaining('"runType":"external-apply"'),
      }),
    });
  });

});
