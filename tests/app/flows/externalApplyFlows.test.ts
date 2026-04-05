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
        async selectOption() {
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
        jobPosting: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
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
        payload: expect.objectContaining({
          meta: expect.objectContaining({
            metrics: expect.objectContaining({
              fieldCount: 2,
              filledCount: 2,
              semanticFieldCount: 2,
              semanticAnswerCount: 2,
              manualReviewPlannedCount: 0,
            }),
          }),
        }),
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
        jobPosting: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
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
        jobPosting: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
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
      .mockResolvedValueOnce("Initial application page")
      .mockResolvedValueOnce("Actual application form")
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
        jobPosting: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
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

  it("records a single-step dry run as one completed step with a final submit stage", async () => {
    const goto = vi.fn();
    const evaluate = vi.fn();
    evaluate
      .mockResolvedValueOnce({
        url: "https://example.com/single-step",
        title: "Single-step form",
        fields: [
          {
            key: "candidate_name",
            label: "Full name",
            inputType: "text",
            required: true,
            options: [],
            placeholder: "Full name",
            helpText: null,
            accept: null,
          },
          {
            key: "candidate_email",
            label: "Email",
            inputType: "email",
            required: true,
            options: [],
            placeholder: "Email",
            helpText: null,
            accept: null,
          },
        ],
        precursorLinks: [],
      })
      .mockResolvedValueOnce("Initial single-step page text")
      .mockResolvedValueOnce("Single-step page text");

    const deps = {
      loadCandidateMasterProfile: vi.fn().mockResolvedValue(buildCandidateProfile()),
      prisma: {
        jobPosting: { findUnique: vi.fn().mockResolvedValue(null) },
        candidateProfileSnapshot: { create: vi.fn().mockResolvedValue({ id: "snapshot_1" }) },
        preparedAnswerSet: { create: vi.fn().mockResolvedValue({ id: "prepared_1" }) },
        systemLog: { create: vi.fn().mockResolvedValue({}) },
      },
      withPage: vi.fn(async (fn: (page: unknown) => Promise<unknown>) =>
        fn(
          createFlowPage({
            goto,
            evaluate,
            visibleSelectors: [
              `[name="candidate_name"]`,
              `[name="candidate_email"]`,
              `button:has-text("Submit")`,
            ],
          }),
        )),
      completePrompt: vi.fn(),
      writeRunReport: vi.fn().mockResolvedValue("artifacts/external-apply-runs/report.json"),
      logger: { info: vi.fn(), error: vi.fn() },
    } as any;

    const result = await runExternalApplyDryRunFlow(
      {
        mode: "external-apply",
        url: "https://example.com/single-step",
        resumePath: "./user/resume.pdf",
        dryRun: true,
      },
      deps,
    );

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]).toEqual(
      expect.objectContaining({
        stepIndex: 1,
        fieldCount: 2,
        primaryAction: "submit",
        advanced: false,
        finalStage: "final_submit_step",
      }),
    );
    expect(result.finalStage).toBe("final_submit_step");
    expect(result.stopReason).toContain("final submit step");
  });

  it("re-discovers and re-plans each step after Next in a multi-step external flow", async () => {
    const goto = vi.fn();
    const evaluate = vi.fn();
    evaluate
      .mockResolvedValueOnce({
        url: "https://example.com/apply",
        title: "Step 1",
        fields: [
          {
            key: "email",
            label: "Email address",
            inputType: "email",
            required: true,
            options: [],
            placeholder: "Email address",
            helpText: null,
            accept: null,
            selectorHints: ['[name="email"]'],
          },
        ],
        precursorLinks: [],
      })
      .mockResolvedValueOnce("Initial page text")
      .mockResolvedValueOnce("Step 1 page text")
      .mockResolvedValueOnce({
        url: "https://example.com/apply",
        title: "Step 2",
        fields: [
          {
            key: "name",
            label: "Full name",
            inputType: "text",
            required: true,
            options: [],
            placeholder: "Full name",
            helpText: null,
            accept: null,
            selectorHints: ['[name="name"]'],
          },
          {
            key: "salaryCurrency",
            label: "Desired Salary",
            inputType: "select",
            required: false,
            options: ["US Dollar ($)", "Turkish Lira (TL)"],
            placeholder: null,
            helpText: null,
            accept: null,
            selectorHints: ['[name="salaryCurrency"]'],
          },
        ],
        precursorLinks: [],
      })
      .mockResolvedValueOnce("Step 2 page text after next")
      .mockResolvedValueOnce("Step 2 current page text")
      .mockResolvedValueOnce({
        url: "https://example.com/apply/complete",
        title: "Complete",
        fields: [],
        precursorLinks: [],
      })
      .mockResolvedValueOnce("Thank you for applying!");

    let stepState = 1;
    const page = {
      goto,
      evaluate(callback: unknown, ...rest: unknown[]) {
        if (typeof callback === "function") {
          return Promise.resolve([]);
        }
        return evaluate(callback as never, ...(rest as never[]));
      },
      waitForTimeout: vi.fn(async () => undefined),
      locator(selector: string) {
        return {
          first() {
            return this;
          },
          async count() {
            const currentVisibleSelectors =
              stepState === 1
                ? [`[name="email"]`, `button:has-text("Next")`]
                : [
                    `[name="name"]`,
                    `[name="salaryCurrency"]`,
                    `button:has-text("Submit")`,
                  ];
            return currentVisibleSelectors.includes(selector) ? 1 : 0;
          },
          async click() {
            if (selector === `button:has-text("Next")`) {
              stepState = 2;
            }
            return undefined;
          },
          async fill() {
            return undefined;
          },
          async selectOption() {
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

    const deps = {
      loadCandidateMasterProfile: vi.fn().mockResolvedValue(buildCandidateProfile()),
      prisma: {
        jobPosting: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
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
      withPage: vi.fn(async (fn: (page: unknown) => Promise<unknown>) => fn(page)),
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
        url: "https://example.com/apply",
        resumePath: "./user/resume.pdf",
        dryRun: false,
      },
      deps,
    );

    expect(result.steps).toHaveLength(2);
    expect(result.steps[0]).toEqual(
      expect.objectContaining({
        stepIndex: 1,
        fieldCount: 1,
        primaryAction: "next",
        advanced: true,
        finalStage: "form_step",
      }),
    );
    expect(result.steps[1]).toEqual(
      expect.objectContaining({
        stepIndex: 2,
        fieldCount: 2,
        primaryAction: "submit",
        finalStage: "completed",
      }),
    );
    expect(result.answerPlan).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldKey: "email" }),
        expect.objectContaining({ fieldKey: "name" }),
        expect.objectContaining({
          fieldKey: "salaryCurrency",
          semanticKey: "salary.currency",
        }),
      ]),
    );
    expect(deps.prisma.systemLog.create).toHaveBeenCalled();
    expect(result.finalStage).toBe("completed");
  });

  it("surfaces native validation feedback in the stop reason when the page refuses to advance", async () => {
    const goto = vi.fn();
    const evaluate = vi.fn();
    evaluate
      .mockResolvedValueOnce({
        url: "https://example.com/apply",
        title: "Step 2",
        fields: [
          {
            key: "sponsorWorkVisaDetails",
            label: "Please provide more details so we can support you:",
            inputType: "textarea",
            required: true,
            options: [],
            placeholder: null,
            helpText: null,
            accept: null,
            selectorHints: ['[name="sponsorWorkVisaDetails"]'],
          },
        ],
        precursorLinks: [],
      })
      .mockResolvedValueOnce("Step 2 page text")
      .mockResolvedValueOnce("Step 2 page text")
      .mockResolvedValueOnce({
        url: "https://example.com/apply",
        title: "Step 2",
        fields: [
          {
            key: "sponsorWorkVisaDetails",
            label: "Please provide more details so we can support you:",
            inputType: "textarea",
            required: true,
            options: [],
            placeholder: null,
            helpText: null,
            accept: null,
            selectorHints: ['[name="sponsorWorkVisaDetails"]'],
          },
        ],
        precursorLinks: [],
      })
      .mockResolvedValueOnce("Step 2 page text after failed continue");

    const page = {
      goto,
      evaluate(callback: unknown, ...rest: unknown[]) {
        if (
          typeof callback === "function" &&
          String(callback).includes("querySelectorAll")
        ) {
          return Promise.resolve([
            {
              severity: "error",
              message: "Do you require sponsorship for a work visa?: Please fill out this field.",
              source: "external.validation",
            },
          ]);
        }
        return evaluate(callback as never, ...(rest as never[]));
      },
      waitForTimeout: vi.fn(async () => undefined),
      locator(selector: string) {
        return {
          first() {
            return this;
          },
          async count() {
            const visibleSelectors = [
              `[name="sponsorWorkVisaDetails"]`,
              `button:has-text("Next")`,
            ];
            return visibleSelectors.includes(selector) ? 1 : 0;
          },
          async click() {
            return undefined;
          },
          async fill() {
            return undefined;
          },
          async selectOption() {
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

    const deps = {
      loadCandidateMasterProfile: vi.fn().mockResolvedValue(buildCandidateProfile({
        regionalAuthorization: {
          defaultRequiresSponsorship: true,
          turkeyRequiresSponsorship: false,
          europeRequiresSponsorship: true,
        },
      })),
      prisma: {
        jobPosting: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
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
      withPage: vi.fn(async (fn: (page: unknown) => Promise<unknown>) => fn(page)),
      completePrompt: vi.fn(),
      writeRunReport: vi.fn().mockResolvedValue("artifacts/external-apply-runs/report.json"),
      logger: {
        info: vi.fn(),
        error: vi.fn(),
      },
    } as any;

    const result = await runExternalApplyDryRunFlow(
      {
        mode: "external-apply",
        url: "https://example.com/apply",
        resumePath: "./user/resume.pdf",
        dryRun: true,
      },
      deps,
    );

    expect(result.steps).toHaveLength(1);
    expect(result.finalStage).toBe("final_submit_step");
    expect(result.stopReason).toContain("Please fill out this field.");
    expect(result.steps[0]?.blockingRequiredFields).toEqual([
      "Please provide more details so we can support you:",
    ]);
  });

  it("links external prepared answers back to the originating LinkedIn job when provided", async () => {
    const goto = vi.fn();
    const evaluate = vi.fn();
    evaluate
      .mockResolvedValueOnce({
        url: "https://apply.workable.com/j/64A61ED04E",
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
      .mockResolvedValueOnce("Actual application form");

    const findUnique = vi
      .fn()
      .mockResolvedValueOnce({ id: "job_linkedin_1" });

    const deps = {
      loadCandidateMasterProfile: vi.fn().mockResolvedValue(buildCandidateProfile()),
      prisma: {
        jobPosting: {
          findUnique,
        },
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
      completePrompt: vi.fn(),
      writeRunReport: vi.fn().mockResolvedValue("artifacts/external-apply-runs/report.json"),
      logger: {
        info: vi.fn(),
        error: vi.fn(),
      },
    } as any;

    await runExternalApplyDryRunFlow(
      {
        mode: "external-apply",
        url: "https://apply.workable.com/j/64A61ED04E",
        resumePath: "./user/resume.pdf",
        dryRun: true,
      },
      deps,
      {
        originalJobUrl: "https://www.linkedin.com/jobs/view/4358153114",
      },
    );

    expect(findUnique).toHaveBeenCalledWith({
      where: { url: "https://www.linkedin.com/jobs/view/4358153114" },
      select: { id: true },
    });
    expect(deps.prisma.preparedAnswerSet.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobPostingId: "job_linkedin_1",
        answersJson: expect.stringContaining(
          '"originalJobUrl":"https://www.linkedin.com/jobs/view/4358153114"',
        ),
      }),
    });
  });

});
