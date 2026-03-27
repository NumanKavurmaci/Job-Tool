import { describe, expect, it, vi } from "vitest";
import {
  chooseRadioValue,
  isAutoHandledQuestion,
  isManualReviewAnswer,
  isSubmitButtonLabel,
  runEasyApplyBatchDryRun,
  runEasyApplyDryRun,
} from "../../src/linkedin/easyApply.js";

const profile = {
  fullName: "Jane Doe",
  email: "jane@example.com",
  phone: "123",
  location: "Berlin",
  linkedinUrl: "https://linkedin.com/in/jane",
  githubUrl: null,
  portfolioUrl: null,
  summary: "Backend engineer",
  yearsOfExperienceTotal: 4,
  currentTitle: "Backend Engineer",
  preferredRoles: ["Backend Engineer"],
  preferredTechStack: ["TypeScript", "React", "Node.js"],
  skills: ["TypeScript", "React", "Node.js"],
  languages: ["English"],
  workAuthorization: "authorized",
  requiresSponsorship: false,
  willingToRelocate: false,
  remotePreference: "remote",
  remoteOnly: true,
  disability: {
    hasVisualDisability: true,
    disabilityPercentage: 46,
    requiresAccommodation: null,
    accommodationNotes: null,
    disclosurePreference: "manual-review",
  },
  education: [],
  experience: [],
  projects: [],
  resumeText: "resume text",
  sourceMetadata: {},
} as const;

describe("easy apply helpers", () => {
  it("detects submit labels and manual-review answers", () => {
    expect(isSubmitButtonLabel("Submit application")).toBe(true);
    expect(
      isManualReviewAnswer({
        questionType: "salary",
        strategy: "needs-review",
        answer: null,
        confidence: 0.2,
        confidenceLabel: "manual_review",
        source: "manual",
      }),
    ).toBe(true);
  });

  it("chooses matching radio values", () => {
    expect(chooseRadioValue(["Yes", "No"], true)).toBe("Yes");
    expect(chooseRadioValue(["Yes", "No"], false)).toBe("No");
    expect(chooseRadioValue(["Remote", "Hybrid"], "remote")).toBe("Remote");
    expect(chooseRadioValue(["Prefer not to say", "No"], "prefer")).toBe("Prefer not to say");
    expect(chooseRadioValue(["Yes", "No"], null)).toBeNull();
  });

  it("detects auto-handled resume/document fields", () => {
    expect(
      isAutoHandledQuestion({
        fieldKey: "file-1",
        label: "Upload resume",
        inputType: "file",
        required: true,
      }),
    ).toBe(true);
    expect(
      isAutoHandledQuestion({
        fieldKey: "radio-1",
        label: "Select resume Jane Doe CV.pdf",
        inputType: "radio",
        required: false,
      }),
    ).toBe(true);
  });
});

describe("runEasyApplyDryRun", () => {
  it("stops safely when it reaches the submit step", async () => {
    const driver = {
      open: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn(),
      collectQuestions: vi
        .fn()
        .mockResolvedValueOnce([
          {
            fieldKey: "q1",
            label: "What is your phone number?",
            inputType: "text",
            required: true,
          },
        ])
        .mockResolvedValueOnce([]),
      fillAnswer: vi.fn().mockResolvedValue({ filled: true }),
      getPrimaryAction: vi.fn().mockResolvedValueOnce("next").mockResolvedValueOnce("submit"),
      advance: vi.fn(),
    };

    const result = await runEasyApplyDryRun({
      driver,
      url: "https://www.linkedin.com/jobs/view/1",
      candidateProfile: profile,
      resolveAnswer: async () => ({
        questionType: "contact_info",
        strategy: "deterministic",
        answer: "123",
        confidence: 0.95,
        confidenceLabel: "high",
        source: "candidate-profile",
      }),
    });

    expect(result.status).toBe("ready_to_submit");
    expect(driver.advance).toHaveBeenCalledWith("next");
    expect(result.steps).toHaveLength(2);
  });

  it("skips required fields that LinkedIn already pre-filled", async () => {
    const driver = {
      open: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn(),
      collectQuestions: vi
        .fn()
        .mockResolvedValueOnce([
          {
            fieldKey: "q1",
            label: "First name",
            inputType: "text",
            required: true,
            currentValue: "Jane",
            isPrefilled: true,
          },
        ])
        .mockResolvedValueOnce([]),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn().mockResolvedValueOnce("next").mockResolvedValueOnce("submit"),
      advance: vi.fn(),
    };

    const resolveAnswerMock = vi.fn().mockResolvedValue({
      questionType: "contact_info",
      strategy: "deterministic",
      answer: "Jane",
      confidence: 0.95,
      confidenceLabel: "high",
      source: "candidate-profile",
    });

    const result = await runEasyApplyDryRun({
      driver,
      url: "https://www.linkedin.com/jobs/view/1",
      candidateProfile: profile,
      resolveAnswer: resolveAnswerMock,
    });

    expect(result.status).toBe("ready_to_submit");
    expect(resolveAnswerMock).not.toHaveBeenCalled();
    expect(driver.fillAnswer).not.toHaveBeenCalled();
  });

  it("skips file upload fields so resume-only steps can continue", async () => {
    const driver = {
      open: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn(),
      collectQuestions: vi
        .fn()
        .mockResolvedValueOnce([
          {
            fieldKey: "q1",
            label: "Upload resume",
            inputType: "file",
            required: true,
          },
        ])
        .mockResolvedValueOnce([]),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn().mockResolvedValueOnce("next").mockResolvedValueOnce("submit"),
      advance: vi.fn(),
    };

    const resolveAnswerMock = vi.fn();

    const result = await runEasyApplyDryRun({
      driver,
      url: "https://www.linkedin.com/jobs/view/1",
      candidateProfile: profile,
      resolveAnswer: resolveAnswerMock,
    });

    expect(result.status).toBe("ready_to_submit");
    expect(resolveAnswerMock).not.toHaveBeenCalled();
    expect(driver.fillAnswer).not.toHaveBeenCalled();
  });

  it("continues when a required question is answered through AI fallback", async () => {
    const driver = {
      open: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn(),
      collectQuestions: vi
        .fn()
        .mockResolvedValueOnce([
          {
            fieldKey: "q1",
            label: "Do you require any reasonable accommodation?",
            inputType: "radio",
            options: ["Yes", "No"],
            required: true,
          },
        ])
        .mockResolvedValueOnce([]),
      fillAnswer: vi.fn().mockResolvedValue({ filled: true }),
      getPrimaryAction: vi.fn().mockResolvedValueOnce("next").mockResolvedValueOnce("submit"),
      advance: vi.fn(),
    };

    const result = await runEasyApplyDryRun({
      driver,
      url: "https://www.linkedin.com/jobs/view/1",
      candidateProfile: profile,
      resolveAnswer: async () => ({
        questionType: "accessibility",
        strategy: "generated",
        answer: "No",
        confidence: 0.52,
        confidenceLabel: "low",
        source: "llm",
      }),
    });

    expect(result.status).toBe("ready_to_submit");
    expect(driver.fillAnswer).toHaveBeenCalled();
    expect(driver.advance).toHaveBeenCalledWith("next");
  });

  it("stops when a required field fails validation after filling", async () => {
    const driver = {
      open: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn(),
      collectQuestions: vi.fn().mockResolvedValue([
        {
          fieldKey: "q1",
          label: "How many years of experience do you have with Linux?",
          inputType: "text",
          required: true,
        },
      ]),
      fillAnswer: vi.fn().mockResolvedValue({
        filled: false,
        details: "Enter a decimal number larger than 0.0",
      }),
      getPrimaryAction: vi.fn().mockResolvedValue("next"),
      advance: vi.fn(),
    };

    const result = await runEasyApplyDryRun({
      driver,
      url: "https://www.linkedin.com/jobs/view/1",
      candidateProfile: profile,
      resolveAnswer: async () => ({
        questionType: "years_of_experience",
        strategy: "resume-derived",
        answer: "0",
        confidence: 0.75,
        confidenceLabel: "medium",
        source: "resume",
      }),
    });

    expect(result.status).toBe("stopped_manual_review");
    expect(result.steps[0]?.questions[0]?.details).toContain("decimal number");
  });

  it("can advance to review when a formerly manual-review question gets an AI answer", async () => {
    const driver = {
      open: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn(),
      collectQuestions: vi
        .fn()
        .mockResolvedValueOnce([
          {
            fieldKey: "q1",
            label: "What is your GPA?",
            inputType: "text",
            required: true,
          },
        ])
        .mockResolvedValueOnce([]),
      fillAnswer: vi.fn().mockResolvedValue({ filled: true }),
      getPrimaryAction: vi.fn().mockResolvedValueOnce("review").mockResolvedValueOnce("submit"),
      advance: vi.fn(),
    };

    const result = await runEasyApplyDryRun({
      driver,
      url: "https://www.linkedin.com/jobs/view/1",
      candidateProfile: profile,
      resolveAnswer: async () => ({
        questionType: "education",
        strategy: "generated",
        answer: "2.4",
        confidence: 0.55,
        confidenceLabel: "low",
        source: "llm",
      }),
    });

    expect(result.status).toBe("ready_to_submit");
    expect(driver.advance).toHaveBeenCalledWith("review");
  });

  it("stops when review repeats without advancing and required fields are unresolved", async () => {
    const driver = {
      open: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn(),
      collectQuestions: vi.fn().mockResolvedValue([
        {
          fieldKey: "q1",
          label: "What is your salary expectation?",
          inputType: "text",
          required: true,
        },
      ]),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn().mockResolvedValue("review"),
      advance: vi.fn(),
    };

    const result = await runEasyApplyDryRun({
      driver,
      url: "https://www.linkedin.com/jobs/view/1",
      candidateProfile: profile,
      resolveAnswer: async () => ({
        questionType: "salary",
        strategy: "needs-review",
        answer: null,
        confidence: 0.2,
        confidenceLabel: "manual_review",
        source: "manual",
      }),
      maxSteps: 3,
    });

    expect(result.status).toBe("stopped_manual_review");
    expect(result.stopReason).toContain("did not advance");
  });

  it("stops when easy apply is unavailable", async () => {
    const driver = {
      open: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(false),
      openEasyApply: vi.fn(),
      collectQuestions: vi.fn(),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn(),
      advance: vi.fn(),
    };

    const result = await runEasyApplyDryRun({
      driver,
      url: "https://www.linkedin.com/jobs/view/1",
      candidateProfile: profile,
      resolveAnswer: async () => ({
        questionType: "contact_info",
        strategy: "deterministic",
        answer: "123",
        confidence: 0.95,
        confidenceLabel: "high",
        source: "candidate-profile",
      }),
    });

    expect(result.status).toBe("stopped_not_easy_apply");
  });

  it("skips jobs that already have an applied badge", async () => {
    const driver = {
      open: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(false),
      isAlreadyApplied: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn(),
      collectQuestions: vi.fn(),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn(),
      advance: vi.fn(),
    };

    const result = await runEasyApplyDryRun({
      driver,
      url: "https://www.linkedin.com/jobs/view/1",
      candidateProfile: profile,
      resolveAnswer: async () => ({
        questionType: "contact_info",
        strategy: "deterministic",
        answer: "123",
        confidence: 0.95,
        confidenceLabel: "high",
        source: "candidate-profile",
      }),
    });

    expect(result.status).toBe("stopped_not_easy_apply");
    expect(result.stopReason).toContain("already been applied");
  });

  it("stops on unknown primary actions", async () => {
    const driver = {
      open: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn(),
      collectQuestions: vi.fn().mockResolvedValue([]),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn().mockResolvedValue("unknown"),
      advance: vi.fn(),
    };

    const result = await runEasyApplyDryRun({
      driver,
      url: "https://www.linkedin.com/jobs/view/1",
      candidateProfile: profile,
      resolveAnswer: async () => ({
        questionType: "contact_info",
        strategy: "deterministic",
        answer: "123",
        confidence: 0.95,
        confidenceLabel: "high",
        source: "candidate-profile",
      }),
    });

    expect(result.status).toBe("stopped_unknown_action");
    expect(result.stopReason).toContain("Could not determine");
  });

  it("stops on repeated review when the step does not advance without manual review blockers", async () => {
    const driver = {
      open: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn(),
      collectQuestions: vi.fn().mockResolvedValue([
        {
          fieldKey: "q1",
          label: "Portfolio URL",
          inputType: "text",
          required: false,
        },
      ]),
      fillAnswer: vi.fn().mockResolvedValue({ filled: true }),
      getPrimaryAction: vi.fn().mockResolvedValue("review"),
      advance: vi.fn(),
    };

    const result = await runEasyApplyDryRun({
      driver,
      url: "https://www.linkedin.com/jobs/view/1",
      candidateProfile: profile,
      resolveAnswer: async () => ({
        questionType: "contact_info",
        strategy: "deterministic",
        answer: "https://example.com",
        confidence: 0.9,
        confidenceLabel: "high",
        source: "candidate-profile",
      }),
      maxSteps: 3,
    });

    expect(result.status).toBe("stopped_unknown_action");
    expect(result.stopReason).toContain("repeated without advancing");
  });

  it("stops when the step limit is exceeded", async () => {
    const driver = {
      open: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn(),
      collectQuestions: vi.fn().mockResolvedValue([]),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn().mockResolvedValue("next"),
      advance: vi.fn(),
    };

    const result = await runEasyApplyDryRun({
      driver,
      url: "https://www.linkedin.com/jobs/view/1",
      candidateProfile: profile,
      resolveAnswer: async () => ({
        questionType: "contact_info",
        strategy: "deterministic",
        answer: "123",
        confidence: 0.95,
        confidenceLabel: "high",
        source: "candidate-profile",
      }),
      maxSteps: 1,
    });

    expect(result.status).toBe("stopped_unknown_action");
    expect(result.stopReason).toContain("Exceeded the Easy Apply step limit");
  });
});

describe("runEasyApplyBatchDryRun", () => {
  it("processes multiple discovered jobs from the collection page", async () => {
    const driver = {
      open: vi.fn(),
      openCollection: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn(),
      collectQuestions: vi.fn().mockResolvedValue([]),
      collectVisibleJobUrls: vi.fn().mockResolvedValue([
        "https://www.linkedin.com/jobs/view/1",
        "https://www.linkedin.com/jobs/view/2",
      ]),
      goToNextResultsPage: vi.fn().mockResolvedValue(false),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn().mockResolvedValue("submit"),
      advance: vi.fn(),
    };

    const result = await runEasyApplyBatchDryRun({
      driver,
      url: "https://www.linkedin.com/jobs/collections/easy-apply",
      targetCount: 2,
      candidateProfile: profile,
      evaluateJob: async () => ({
        shouldApply: true,
        finalDecision: "APPLY",
        score: 82,
        reason: "Strong fit.",
        policyAllowed: true,
      }),
      resolveAnswer: async () => ({
        questionType: "contact_info",
        strategy: "deterministic",
        answer: "123",
        confidence: 0.95,
        confidenceLabel: "high",
        source: "candidate-profile",
      }),
    });

    expect(result.status).toBe("completed");
    expect(result.attemptedCount).toBe(2);
    expect(result.pagesVisited).toBe(1);
    expect(result.jobs).toHaveLength(2);
    expect(driver.openCollection).toHaveBeenCalledWith(
      "https://www.linkedin.com/jobs/collections/easy-apply",
    );
  });

  it("paginates and deduplicates jobs until the requested count is reached", async () => {
    const driver = {
      open: vi.fn(),
      openCollection: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn(),
      collectQuestions: vi.fn().mockResolvedValue([]),
      collectVisibleJobUrls: vi
        .fn()
        .mockResolvedValueOnce([
          "https://www.linkedin.com/jobs/view/1",
          "https://www.linkedin.com/jobs/view/2",
        ])
        .mockResolvedValueOnce([
          "https://www.linkedin.com/jobs/view/2",
          "https://www.linkedin.com/jobs/view/3",
        ]),
      goToNextResultsPage: vi.fn().mockResolvedValue(true),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn().mockResolvedValue("submit"),
      advance: vi.fn(),
    };

    const result = await runEasyApplyBatchDryRun({
      driver,
      url: "https://www.linkedin.com/jobs/collections/easy-apply",
      targetCount: 3,
      candidateProfile: profile,
      evaluateJob: async () => ({
        shouldApply: true,
        finalDecision: "APPLY",
        score: 82,
        reason: "Strong fit.",
        policyAllowed: true,
      }),
      resolveAnswer: async () => ({
        questionType: "contact_info",
        strategy: "deterministic",
        answer: "123",
        confidence: 0.95,
        confidenceLabel: "high",
        source: "candidate-profile",
      }),
    });

    expect(result.status).toBe("completed");
    expect(result.attemptedCount).toBe(3);
    expect(result.pagesVisited).toBe(2);
    expect(result.jobs.map((job) => job.url)).toEqual([
      "https://www.linkedin.com/jobs/view/1",
      "https://www.linkedin.com/jobs/view/2",
      "https://www.linkedin.com/jobs/view/3",
    ]);
    expect(driver.goToNextResultsPage).toHaveBeenCalledTimes(1);
  });

  it("returns a no-jobs result when the collection page does not expose any jobs", async () => {
    const driver = {
      open: vi.fn(),
      openCollection: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn(),
      openEasyApply: vi.fn(),
      collectQuestions: vi.fn(),
      collectVisibleJobUrls: vi.fn().mockResolvedValue([]),
      goToNextResultsPage: vi.fn().mockResolvedValue(false),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn(),
      advance: vi.fn(),
    };

    const result = await runEasyApplyBatchDryRun({
      driver,
      url: "https://www.linkedin.com/jobs/collections/easy-apply",
      targetCount: 2,
      candidateProfile: profile,
      evaluateJob: async () => ({
        shouldApply: true,
        finalDecision: "APPLY",
        score: 82,
        reason: "Strong fit.",
        policyAllowed: true,
      }),
      resolveAnswer: async () => ({
        questionType: "contact_info",
        strategy: "deterministic",
        answer: "123",
        confidence: 0.95,
        confidenceLabel: "high",
        source: "candidate-profile",
      }),
    });

    expect(result.status).toBe("stopped_no_jobs");
    expect(result.attemptedCount).toBe(0);
    expect(result.stopReason).toContain("No LinkedIn Easy Apply jobs");
  });

  it("continues batch processing when one discovered job throws", async () => {
    const driver = {
      open: vi.fn(),
      openCollection: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi
        .fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true),
      openEasyApply: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("modal did not open")),
      collectQuestions: vi.fn().mockResolvedValue([]),
      collectVisibleJobUrls: vi.fn().mockResolvedValue([
        "https://www.linkedin.com/jobs/view/1",
        "https://www.linkedin.com/jobs/view/2",
      ]),
      goToNextResultsPage: vi.fn().mockResolvedValue(false),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn().mockResolvedValue("submit"),
      advance: vi.fn(),
    };

    const result = await runEasyApplyBatchDryRun({
      driver,
      url: "https://www.linkedin.com/jobs/collections/easy-apply",
      targetCount: 2,
      candidateProfile: profile,
      evaluateJob: async () => ({
        shouldApply: true,
        finalDecision: "APPLY",
        score: 82,
        reason: "Strong fit.",
        policyAllowed: true,
      }),
      resolveAnswer: async () => ({
        questionType: "contact_info",
        strategy: "deterministic",
        answer: "123",
        confidence: 0.95,
        confidenceLabel: "high",
        source: "candidate-profile",
      }),
    });

    expect(result.status).toBe("completed");
    expect(result.jobs[0]?.result.status).toBe("ready_to_submit");
    expect(result.jobs[1]?.result.status).toBe("stopped_unknown_action");
    expect(result.jobs[1]?.result.stopReason).toContain("modal did not open");
  });

  it("skips bad-fit jobs and keeps paginating until enough eligible jobs are found", async () => {
    const driver = {
      open: vi.fn(),
      openCollection: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn(),
      collectQuestions: vi.fn().mockResolvedValue([]),
      collectVisibleJobUrls: vi
        .fn()
        .mockResolvedValueOnce([
          "https://www.linkedin.com/jobs/view/1",
          "https://www.linkedin.com/jobs/view/2",
        ])
        .mockResolvedValueOnce([
          "https://www.linkedin.com/jobs/view/3",
        ]),
      goToNextResultsPage: vi.fn().mockResolvedValue(true),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn().mockResolvedValue("submit"),
      advance: vi.fn(),
    };

    const evaluateJob = vi
      .fn()
      .mockResolvedValueOnce({
        shouldApply: false,
        finalDecision: "SKIP",
        score: 18,
        reason: "Low fit.",
        policyAllowed: true,
      })
      .mockResolvedValueOnce({
        shouldApply: true,
        finalDecision: "APPLY",
        score: 83,
        reason: "Strong fit.",
        policyAllowed: true,
      })
      .mockResolvedValueOnce({
        shouldApply: true,
        finalDecision: "APPLY",
        score: 79,
        reason: "Strong fit.",
        policyAllowed: true,
      });

    const result = await runEasyApplyBatchDryRun({
      driver,
      url: "https://www.linkedin.com/jobs/collections/easy-apply",
      targetCount: 2,
      candidateProfile: profile,
      evaluateJob,
      resolveAnswer: async () => ({
        questionType: "contact_info",
        strategy: "deterministic",
        answer: "123",
        confidence: 0.95,
        confidenceLabel: "high",
        source: "candidate-profile",
      }),
    });

    expect(result.status).toBe("completed");
    expect(result.attemptedCount).toBe(2);
    expect(result.skippedCount).toBe(1);
    expect(result.evaluatedCount).toBe(3);
    expect(result.jobs[0]?.evaluation.finalDecision).toBe("SKIP");
    expect(result.jobs[0]?.result).toBeUndefined();
    expect(driver.goToNextResultsPage).toHaveBeenCalledTimes(1);
  });

  it("skips already-applied collection jobs before evaluation", async () => {
    const driver = {
      open: vi.fn(),
      openCollection: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn(),
      collectQuestions: vi.fn().mockResolvedValue([]),
      collectVisibleJobs: vi.fn().mockResolvedValue([
        { url: "https://www.linkedin.com/jobs/view/1", alreadyApplied: true },
        { url: "https://www.linkedin.com/jobs/view/2", alreadyApplied: false },
      ]),
      goToNextResultsPage: vi.fn().mockResolvedValue(false),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn().mockResolvedValue("submit"),
      advance: vi.fn(),
    };

    const evaluateJob = vi.fn().mockResolvedValue({
      shouldApply: true,
      finalDecision: "APPLY",
      score: 82,
      reason: "Strong fit.",
      policyAllowed: true,
    });

    const result = await runEasyApplyBatchDryRun({
      driver,
      url: "https://www.linkedin.com/jobs/collections/easy-apply",
      targetCount: 1,
      candidateProfile: profile,
      evaluateJob,
      resolveAnswer: async () => ({
        questionType: "contact_info",
        strategy: "deterministic",
        answer: "123",
        confidence: 0.95,
        confidenceLabel: "high",
        source: "candidate-profile",
      }),
    });

    expect(result.status).toBe("completed");
    expect(result.skippedCount).toBe(1);
    expect(result.jobs[0]?.evaluation.finalDecision).toBe("SKIP");
    expect(result.jobs[0]?.evaluation.reason).toContain("already");
    expect(evaluateJob).toHaveBeenCalledTimes(1);
    expect(evaluateJob).toHaveBeenCalledWith("https://www.linkedin.com/jobs/view/2");
  });
});
