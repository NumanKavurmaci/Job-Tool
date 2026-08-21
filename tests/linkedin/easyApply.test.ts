import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedAnswer } from "../../src/answers/types.js";
import type { EasyApplyProcessingTimeoutResetInput } from "../../src/linkedin/easyApply.js";
const { repairAnswerFromSiteFeedbackMock } = vi.hoisted(() => ({
  repairAnswerFromSiteFeedbackMock: vi.fn(),
}));
vi.mock("../../src/questions/strategies/aiCorrection.js", () => ({
  repairAnswerFromSiteFeedback: repairAnswerFromSiteFeedbackMock,
}));
import {
  chooseRadioValue,
  isAutoHandledQuestion,
  isManualReviewAnswer,
  isSubmitButtonLabel,
  resolveLinkedInExternalApplyUrl,
  runEasyApply,
  runEasyApplyBatch,
  runEasyApplyBatchDryRun,
  runEasyApplyBatchInternal,
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

beforeEach(() => {
  repairAnswerFromSiteFeedbackMock.mockReset();
  repairAnswerFromSiteFeedbackMock.mockResolvedValue(null);
});

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

  it("unwraps LinkedIn safety redirect URLs for external apply targets", () => {
    expect(
      resolveLinkedInExternalApplyUrl(
        "https://www.linkedin.com/safety/go/?url=https%3A%2F%2Fapply.workable.com%2Fj%2F64A61ED04E&urlhash=tq5M&isSdui=true",
      ),
    ).toBe("https://apply.workable.com/j/64A61ED04E");
    expect(
      resolveLinkedInExternalApplyUrl(
        "https://www.linkedin.com/safety/go/?url=https%3A%2F%2Fjobs.lever.co%2Fcommencis%2Fa3be10ef-53ab-4842-b114-ae9f60b43e99&urlhash=kEke&isSdui=true",
      ),
    ).toBe("https://jobs.lever.co/commencis/a3be10ef-53ab-4842-b114-ae9f60b43e99");
    expect(resolveLinkedInExternalApplyUrl("https://company.example/apply")).toBe(
      "https://company.example/apply",
    );
  });

  it("rejects unsafe external targets and unwraps only trusted LinkedIn wrappers", () => {
    expect(resolveLinkedInExternalApplyUrl("linkedin-external:Apply on company website")).toBeNull();
    expect(resolveLinkedInExternalApplyUrl("javascript:alert(1)")).toBeNull();
    expect(resolveLinkedInExternalApplyUrl("http://company.example/apply")).toBeNull();
    expect(resolveLinkedInExternalApplyUrl("http://127.0.0.1/admin")).toBeNull();
    expect(resolveLinkedInExternalApplyUrl("https://user:secret@company.example/apply")).toBeNull();
    expect(resolveLinkedInExternalApplyUrl("http://www.linkedin.com/safety/go/?url=https://company.example/apply")).toBeNull();
    expect(
      resolveLinkedInExternalApplyUrl(
        "https://www.linkedin.com/safety/go/?url=http%3A%2F%2F169.254.169.254%2Flatest%2Fmeta-data%2F",
      ),
    ).toBeNull();

    const untrustedWrapper =
      "https://redirect.example/path?url=https%3A%2F%2Fcompany.example%2Fapply";
    expect(resolveLinkedInExternalApplyUrl(untrustedWrapper)).toBe(untrustedWrapper);
    const lookalikeWrapper =
      "https://linkedin.com.evil.test/safety/go/?url=https%3A%2F%2Fcompany.example%2Fapply";
    expect(resolveLinkedInExternalApplyUrl(lookalikeWrapper)).toBe(lookalikeWrapper);
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

  it("stops for manual review when the dry-run submit step still has a required blocker", async () => {
    const driver = {
      open: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn(),
      collectQuestions: vi.fn().mockResolvedValue([
        {
          fieldKey: "salary",
          label: "Salary expectation",
          inputType: "text",
          required: true,
        },
      ]),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn().mockResolvedValue("submit"),
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
    });

    expect(result.status).toBe("stopped_manual_review");
    expect(result.stopReason).toContain("before submitting");
    expect(driver.advance).not.toHaveBeenCalled();
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

  it("stops when a required decimal field receives a non-numeric answer", async () => {
    repairAnswerFromSiteFeedbackMock.mockResolvedValueOnce({
      questionType: "salary",
      strategy: "generated",
      answer: "85000",
      confidence: 0.8,
      confidenceLabel: "high",
      source: "llm",
      notes: ["Corrected from site feedback."],
    });
    const driver = {
      open: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn(),
      collectQuestions: vi.fn()
        .mockResolvedValueOnce([
          {
            fieldKey: "q1",
            label: "Net ücret beklentiniz nedir?",
            inputType: "text",
            required: true,
            expectsDecimal: true,
          },
        ])
        .mockResolvedValueOnce([]),
      fillAnswer: vi.fn()
        .mockResolvedValueOnce({
          filled: false,
          details: "Expected a numeric answer greater than 0 for this LinkedIn field.",
        })
        .mockResolvedValueOnce({
          filled: true,
        }),
      getPrimaryAction: vi.fn()
        .mockResolvedValueOnce("review")
        .mockResolvedValueOnce("submit"),
      advance: vi.fn(),
    };

    const result = await runEasyApplyDryRun({
      driver,
      url: "https://www.linkedin.com/jobs/view/1",
      candidateProfile: profile,
      resolveAnswer: async () => ({
        questionType: "salary",
        strategy: "generated",
        answer: "negotiable",
        confidence: 0.6,
        confidenceLabel: "medium",
        source: "llm",
      }),
    });

    expect(result.status).toBe("ready_to_submit");
    expect(driver.fillAnswer).toHaveBeenCalledTimes(2);
    expect(repairAnswerFromSiteFeedbackMock).toHaveBeenCalledWith(
      expect.objectContaining({
        validationFeedback: "Expected a numeric answer greater than 0 for this LinkedIn field.",
      }),
    );
    expect(result.steps[0]?.questions[0]?.resolved.answer).toBe("85000");
    expect(result.steps[0]?.questions[0]?.details).toContain("after AI corrected");
  });

  it("can advance to review when a formerly manual-review question gets an AI answer", async () => {
    const driver = {
      open: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn(),
      collectStepState: vi
        .fn()
        .mockResolvedValueOnce({
          modalTitle: "Additional questions",
          headingText: "Step 1",
          primaryAction: "review",
          buttonLabels: ["Review"],
        })
        .mockResolvedValueOnce({
          modalTitle: "Review your application",
          headingText: "Review",
          primaryAction: "submit",
          buttonLabels: ["Submit application"],
        }),
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

  it("stops cleanly for external-apply jobs and returns the external target", async () => {
    const driver = {
      open: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(false),
      isExternalApplyAvailable: vi.fn().mockResolvedValue(true),
      getExternalApplyUrl: vi.fn().mockResolvedValue("https://company.example.com/apply"),
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

    expect(result.status).toBe("stopped_external_apply");
    expect(result.externalApplyUrl).toBe("https://company.example.com/apply");
    expect(result.stopReason).toContain("external application page");
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
    expect(result.alreadyApplied).toBe(true);
  });

  it("uses the search-detail applied preflight before opening a single job", async () => {
    const driver = {
      open: vi.fn(),
      ensureAuthenticated: vi.fn(),
      inspectJobApplicationState: vi.fn().mockResolvedValue("already_applied"),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      isExternalApplyAvailable: vi.fn(),
      getExternalApplyDetection: vi.fn(),
      getExternalApplyUrl: vi.fn(),
      openEasyApply: vi.fn(),
      collectQuestions: vi.fn(),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn(),
      advance: vi.fn(),
    };

    const result = await runEasyApplyDryRun({
      driver,
      url: "https://www.linkedin.com/jobs/view/4453899034",
      candidateProfile: profile,
      resolveAnswer: vi.fn(),
    });

    expect(result.alreadyApplied).toBe(true);
    expect(driver.open).not.toHaveBeenCalled();
    expect(driver.isExternalApplyAvailable).not.toHaveBeenCalled();
    expect(driver.getExternalApplyDetection).not.toHaveBeenCalled();
    expect(driver.getExternalApplyUrl).not.toHaveBeenCalled();
    expect(driver.openEasyApply).not.toHaveBeenCalled();
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
    expect(result.failureReasonCode).toBe("linkedin.empty_or_unrecognized_action_state");
    expect(result.retryable).toBe(true);
  });

  it("falls back to page-level primary action when the collected modal state is empty", async () => {
    const driver = {
      open: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn(),
      collectQuestions: vi.fn().mockResolvedValue([]),
      collectStepState: vi.fn().mockResolvedValue({
        modalTitle: null,
        headingText: null,
        primaryAction: "unknown",
        buttonLabels: [],
      }),
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
      maxSteps: 2,
    });

    expect(driver.getPrimaryAction).toHaveBeenCalled();
    expect(driver.advance).toHaveBeenCalledWith("next");
    expect(result.steps[0]?.action).toBe("next");
  });

  it("stops on repeated review when the step does not advance without manual review blockers", async () => {
    const driver = {
      open: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn(),
      collectReviewDiagnostics: vi.fn().mockResolvedValue({
        validationMessages: ["Please complete this required field."],
        blockingFields: [
          {
            fieldKey: "q1",
            label: "Portfolio URL",
            validationMessage: "Please complete this required field.",
            currentValue: "",
            required: false,
          },
        ],
        buttonStates: [
          {
            action: "review",
            visible: true,
            disabled: false,
            label: "Review",
          },
        ],
      }),
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
    expect(result.reviewDiagnostics?.validationMessages).toContain(
      "Please complete this required field.",
    );
    expect(result.reviewDiagnostics?.blockingFields[0]?.fieldKey).toBe("q1");
  });

  it("carries captured site feedback into the final easy apply result", async () => {
    const driver = {
      open: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn(),
      collectSiteFeedback: vi.fn().mockResolvedValue({
        errors: ["LinkedIn says salary must be numeric."],
        warnings: [],
        infos: [],
        messages: [
          {
            severity: "error",
            message: "LinkedIn says salary must be numeric.",
            source: "linkedin.easy-apply",
          },
        ],
      }),
      collectQuestions: vi.fn().mockResolvedValue([
        {
          fieldKey: "q1",
          label: "Net ücret beklentiniz nedir?",
          inputType: "text",
          required: true,
          expectsDecimal: true,
        },
      ]),
      fillAnswer: vi.fn().mockResolvedValue({
        filled: false,
        details: "Expected a numeric answer greater than 0 for this LinkedIn field.",
      }),
      getPrimaryAction: vi.fn().mockResolvedValue("review"),
      advance: vi.fn(),
    };

    const result = await runEasyApplyDryRun({
      driver,
      url: "https://www.linkedin.com/jobs/view/1",
      candidateProfile: profile,
      resolveAnswer: async () => ({
        questionType: "salary",
        strategy: "generated",
        answer: "negotiable",
        confidence: 0.6,
        confidenceLabel: "medium",
        source: "llm",
      }),
    });

    expect(result.siteFeedback?.errors).toContain("LinkedIn says salary must be numeric.");
    expect(result.steps[0]?.siteFeedback?.errors).toContain("LinkedIn says salary must be numeric.");
  });

  it("does not ask AI to repair answers that are already manual-review", async () => {
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
      getPrimaryAction: vi.fn().mockResolvedValue("next"),
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
    });

    expect(result.status).toBe("stopped_manual_review");
    expect(driver.fillAnswer).not.toHaveBeenCalled();
    expect(repairAnswerFromSiteFeedbackMock).not.toHaveBeenCalled();
  });

  it("does not retry when AI repair returns the same answer", async () => {
    repairAnswerFromSiteFeedbackMock.mockResolvedValueOnce({
      questionType: "salary",
      strategy: "generated",
      answer: "negotiable",
      confidence: 0.7,
      confidenceLabel: "medium",
      source: "llm",
    });

    const driver = {
      open: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn(),
      collectQuestions: vi.fn().mockResolvedValue([
        {
          fieldKey: "q1",
          label: "Expected salary",
          inputType: "text",
          required: true,
        },
      ]),
      fillAnswer: vi.fn().mockResolvedValue({
        filled: false,
        details: "Please enter a number.",
      }),
      getPrimaryAction: vi.fn().mockResolvedValue("next"),
      advance: vi.fn(),
    };

    const result = await runEasyApplyDryRun({
      driver,
      url: "https://www.linkedin.com/jobs/view/1",
      candidateProfile: profile,
      resolveAnswer: async () => ({
        questionType: "salary",
        strategy: "generated",
        answer: "negotiable",
        confidence: 0.6,
        confidenceLabel: "medium",
        source: "llm",
      }),
    });

    expect(result.status).toBe("stopped_manual_review");
    expect(driver.fillAnswer).toHaveBeenCalledTimes(1);
  });

  it("keeps the latest validation failure when the repaired answer is also rejected", async () => {
    repairAnswerFromSiteFeedbackMock.mockResolvedValueOnce({
      questionType: "salary",
      strategy: "generated",
      answer: "85000",
      confidence: 0.8,
      confidenceLabel: "high",
      source: "llm",
    });

    const driver = {
      open: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn(),
      collectQuestions: vi.fn().mockResolvedValue([
        {
          fieldKey: "q1",
          label: "Expected salary",
          inputType: "text",
          required: true,
        },
      ]),
      fillAnswer: vi.fn()
        .mockResolvedValueOnce({
          filled: false,
          details: "Please enter a number.",
        })
        .mockResolvedValueOnce({
          filled: false,
          details: "Salary is above the allowed range.",
        }),
      getPrimaryAction: vi.fn().mockResolvedValue("next"),
      advance: vi.fn(),
    };

    const result = await runEasyApplyDryRun({
      driver,
      url: "https://www.linkedin.com/jobs/view/1",
      candidateProfile: profile,
      resolveAnswer: async () => ({
        questionType: "salary",
        strategy: "generated",
        answer: "negotiable",
        confidence: 0.6,
        confidenceLabel: "medium",
        source: "llm",
      }),
    });

    expect(result.status).toBe("stopped_manual_review");
    expect(result.steps[0]?.questions[0]?.details).toContain("allowed range");
    expect(driver.fillAnswer).toHaveBeenCalledTimes(2);
  });

  it("continues without crashing when AI repair throws", async () => {
    repairAnswerFromSiteFeedbackMock.mockRejectedValueOnce(new Error("llm down"));

    const driver = {
      open: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn(),
      collectQuestions: vi.fn().mockResolvedValue([
        {
          fieldKey: "q1",
          label: "Expected salary",
          inputType: "text",
          required: true,
        },
      ]),
      fillAnswer: vi.fn().mockResolvedValue({
        filled: false,
        details: "Please enter a number.",
      }),
      getPrimaryAction: vi.fn().mockResolvedValue("next"),
      advance: vi.fn(),
    };

    const result = await runEasyApplyDryRun({
      driver,
      url: "https://www.linkedin.com/jobs/view/1",
      candidateProfile: profile,
      resolveAnswer: async () => ({
        questionType: "salary",
        strategy: "generated",
        answer: "negotiable",
        confidence: 0.6,
        confidenceLabel: "medium",
        source: "llm",
      }),
    });

    expect(result.status).toBe("stopped_manual_review");
    expect(driver.fillAnswer).toHaveBeenCalledTimes(1);
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
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true),
      openEasyApply: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("modal did not open"))
        .mockResolvedValueOnce(undefined),
      collectQuestions: vi.fn().mockResolvedValue([]),
      collectVisibleJobUrls: vi.fn().mockResolvedValue([
        "https://www.linkedin.com/jobs/view/1",
        "https://www.linkedin.com/jobs/view/2",
        "https://www.linkedin.com/jobs/view/3",
      ]),
      goToNextResultsPage: vi.fn().mockResolvedValue(false),
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

    expect(result.status).toBe("partial");
    expect(result.stopReason).toContain("1 attempt(s) stopped before completion");
    expect(result.jobs[0]?.result.status).toBe("ready_to_submit");
    expect(result.jobs[1]?.result.status).toBe("stopped_unknown_action");
    expect(result.jobs[1]?.result.stopReason).toContain("message=modal did not open");
    expect(result.jobs[1]?.result.recovery).toEqual({
      attempted: true,
      succeeded: true,
      message:
        "Recovered batch context after failure on https://www.linkedin.com/jobs/view/2 by reopening the LinkedIn collection.",
    });
    expect(result.jobs[2]?.result.status).toBe("ready_to_submit");
    expect(driver.ensureAuthenticated).toHaveBeenCalledWith(
      "https://www.linkedin.com/jobs/collections/easy-apply",
    );
    expect(driver.openCollection).toHaveBeenCalledWith(
      "https://www.linkedin.com/jobs/collections/easy-apply",
    );
    expect(driver.openCollection.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("preserves a failed processing result for approved job 4386362641 when the modal never opens", async () => {
    const driver = {
      open: vi.fn(),
      openCollection: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn().mockRejectedValue(
        new Error("Easy Apply modal did not open after clicking the trigger."),
      ),
      collectQuestions: vi.fn().mockResolvedValue([]),
      collectVisibleJobs: vi.fn().mockResolvedValue([
        { url: "https://www.linkedin.com/jobs/view/4386362641", alreadyApplied: false },
      ]),
      goToNextResultsPage: vi.fn().mockResolvedValue(false),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn().mockResolvedValue("submit"),
      advance: vi.fn(),
      dismissCompletionModal: vi.fn().mockResolvedValue(true),
    };

    const result = await runEasyApplyBatchInternal(
      {
        driver,
        url: "https://www.linkedin.com/jobs/collections/easy-apply",
        targetCount: 1,
        candidateProfile: profile,
        evaluateJob: async () => ({
          shouldApply: true,
          finalDecision: "APPLY",
          score: 58,
          reason: "Configured workplace-policy bypass matched this job location, so the role will be applied.",
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
      },
      "submit",
    );

    expect(result.status).toBe("partial");
    expect(result.jobs[0]?.url).toBe("https://www.linkedin.com/jobs/view/4386362641");
    expect(result.jobs[0]?.result?.status).toBe("stopped_unknown_action");
    expect(result.jobs[0]?.result?.stopReason).toContain(
      "Easy Apply modal did not open after clicking the trigger.",
    );
  });

  it("stops batch safely when recovery after a job failure also fails", async () => {
    const neverRecovers = new Promise<void>(() => undefined);
    const driver = {
      open: vi.fn(),
      openCollection: vi.fn().mockResolvedValue(undefined),
      ensureAuthenticated: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockReturnValue(neverRecovers),
      resetAfterProcessingTimeout: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn().mockRejectedValue(new Error("modal crashed before opening")),
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
      collectionContextTimeoutMs: 25,
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

    expect(result.status).toBe("partial");
    expect(result.attemptedCount).toBe(1);
    expect(result.stopReason).toContain("1 attempt(s) stopped before completion");
    expect(result.stopReason).toContain("1 recovery attempt(s) failed");
    expect(result.stopReason).toContain(
      "collection context recovery timed out after 25ms",
    );
    expect(result.jobs[0]?.result?.recovery).toMatchObject({
      attempted: true,
      succeeded: false,
    });
    expect(result.jobs[0]?.result?.recovery?.message).toContain(
      "LinkedIn collection context recovery timed out after 25ms",
    );
    expect(result.jobs).toHaveLength(1);
    expect(driver.resetAfterProcessingTimeout).not.toHaveBeenCalled();
    expect(driver.open).not.toHaveBeenCalledWith("https://www.linkedin.com/jobs/view/2");
  });

  it("keeps the batch alive when evaluateJob throws for one listing", async () => {
    const driver = {
      open: vi.fn(),
      openCollection: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn().mockResolvedValue(undefined),
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

    const evaluateJob = vi
      .fn()
      .mockRejectedValueOnce(
        new Error("phase=linkedin_auth code=LINKEDIN_LOGIN_FORM_NOT_FOUND"),
      )
      .mockResolvedValueOnce({
        shouldApply: true,
        finalDecision: "APPLY",
        score: 81,
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
    expect(result.jobs[0]?.evaluation.reason).toContain("Job evaluation failed:");
    expect(result.jobs[0]?.evaluation.reason).toContain("LINKEDIN_LOGIN_FORM_NOT_FOUND");
    expect(result.jobs[1]?.result?.status).toBe("ready_to_submit");
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

  it("goes to the next results page when the current page only contains previously reviewed jobs", async () => {
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
      goToNextResultsPage: vi
        .fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn().mockResolvedValue("submit"),
      advance: vi.fn(),
    };

    const evaluateJob = vi
      .fn()
      .mockResolvedValueOnce({
        shouldApply: false,
        finalDecision: "SKIP",
        score: 47,
        reason: "Already reviewed recently.",
        policyAllowed: true,
      })
      .mockResolvedValueOnce({
        shouldApply: false,
        finalDecision: "SKIP",
        score: 49,
        reason: "Already reviewed recently.",
        policyAllowed: true,
      })
      .mockResolvedValueOnce({
        shouldApply: true,
        finalDecision: "APPLY",
        score: 81,
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
    expect(result.attemptedCount).toBe(1);
    expect(result.evaluatedCount).toBe(3);
    expect(result.skippedCount).toBe(2);
    expect(result.pagesVisited).toBe(2);
    expect(driver.goToNextResultsPage).toHaveBeenCalledTimes(1);
    expect(evaluateJob).toHaveBeenNthCalledWith(1, "https://www.linkedin.com/jobs/view/1");
    expect(evaluateJob).toHaveBeenNthCalledWith(2, "https://www.linkedin.com/jobs/view/2");
    expect(evaluateJob).toHaveBeenNthCalledWith(3, "https://www.linkedin.com/jobs/view/3");
    expect(result.jobs[0]?.result).toBeUndefined();
    expect(result.jobs[1]?.result).toBeUndefined();
    expect(result.jobs[2]?.result?.status).toBe("ready_to_submit");
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
    expect(result.jobs[0]?.evaluation.alreadyApplied).toBe(true);
    expect(evaluateJob).toHaveBeenCalledTimes(1);
    expect(evaluateJob).toHaveBeenCalledWith("https://www.linkedin.com/jobs/view/2");
  });

  it("checks the search detail panel before parsing or scoring a batch job", async () => {
    const driver = {
      open: vi.fn(),
      openCollection: vi.fn(),
      ensureAuthenticated: vi.fn(),
      inspectJobApplicationState: vi.fn().mockResolvedValue("already_applied"),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      isExternalApplyAvailable: vi.fn(),
      getExternalApplyDetection: vi.fn(),
      getExternalApplyUrl: vi.fn(),
      openEasyApply: vi.fn(),
      collectQuestions: vi.fn().mockResolvedValue([]),
      collectVisibleJobs: vi.fn().mockResolvedValue([
        { url: "https://www.linkedin.com/jobs/view/4453899034", alreadyApplied: false },
      ]),
      goToNextResultsPage: vi.fn().mockResolvedValue(false),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn().mockResolvedValue("submit"),
      advance: vi.fn(),
    };
    const evaluateJob = vi.fn();

    const result = await runEasyApplyBatchDryRun({
      driver,
      url: "https://www.linkedin.com/jobs/search/?currentJobId=4453899034",
      targetCount: 1,
      candidateProfile: profile,
      evaluateJob,
      resolveAnswer: vi.fn(),
    });

    expect(result.jobs[0]?.evaluation).toMatchObject({
      finalDecision: "SKIP",
      score: 0,
      alreadyApplied: true,
    });
    expect(evaluateJob).not.toHaveBeenCalled();
    expect(driver.isExternalApplyAvailable).not.toHaveBeenCalled();
    expect(driver.getExternalApplyDetection).not.toHaveBeenCalled();
    expect(driver.getExternalApplyUrl).not.toHaveBeenCalled();
    expect(driver.openEasyApply).not.toHaveBeenCalled();
  });

  it("rechecks an approved job before opening the application flow", async () => {
    const driver = {
      open: vi.fn(),
      openCollection: vi.fn(),
      ensureAuthenticated: vi.fn(),
      inspectJobApplicationState: vi
        .fn()
        .mockResolvedValueOnce("apply_available")
        .mockResolvedValueOnce("already_applied"),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn(),
      collectQuestions: vi.fn().mockResolvedValue([]),
      collectVisibleJobs: vi.fn().mockResolvedValue([
        { url: "https://www.linkedin.com/jobs/view/4453899034", alreadyApplied: false },
      ]),
      goToNextResultsPage: vi.fn().mockResolvedValue(false),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn().mockResolvedValue("submit"),
      advance: vi.fn(),
    };
    const evaluateJob = vi.fn().mockResolvedValue({
      shouldApply: true,
      finalDecision: "APPLY",
      score: 80,
      reason: "Strong fit.",
      policyAllowed: true,
    });

    const result = await runEasyApplyBatchDryRun({
      driver,
      url: "https://www.linkedin.com/jobs/search/?currentJobId=4453899034",
      targetCount: 1,
      candidateProfile: profile,
      evaluateJob,
      resolveAnswer: vi.fn(),
    });

    expect(evaluateJob).toHaveBeenCalledTimes(1);
    expect(result.jobs[0]?.evaluation.alreadyApplied).toBe(true);
    expect(driver.open).not.toHaveBeenCalled();
    expect(driver.openEasyApply).not.toHaveBeenCalled();
  });
});

describe("runEasyApplyBatch", () => {
  it("submits approved jobs in batch mode", async () => {
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
      dismissCompletionModal: vi.fn().mockResolvedValue(true),
    };

    const result = await runEasyApplyBatch({
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
    expect(result.jobs[0]?.result?.status).toBe("submitted");
    expect(result.jobs[1]?.result?.status).toBe("submitted");
    expect(driver.advance).toHaveBeenCalledWith("submit");
    expect(driver.dismissCompletionModal).toHaveBeenCalledTimes(2);
  });
});

describe("runEasyApplyBatchInternal", () => {
  it("uses the bounded external fast path and continues with the next approved job", async () => {
    const collectionUrl = "https://www.linkedin.com/jobs/collections/easy-apply";
    const externalJobUrl = "https://www.linkedin.com/jobs/view/4456490821";
    const easyApplyJobUrl = "https://www.linkedin.com/jobs/view/4457000000";
    const externalDetection = {
      source: "explicit_company_website_cta" as const,
      signals: ["selector:explicit_company_website_cta"],
    };
    const driver = {
      open: vi.fn(),
      openCollection: vi.fn().mockResolvedValue(undefined),
      ensureAuthenticated: vi.fn().mockResolvedValue(undefined),
      resetAfterProcessingTimeout: vi.fn(),
      inspectJobApplicationState: vi.fn().mockResolvedValue("apply_available"),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      isExternalApplyAvailable: vi.fn().mockResolvedValue(true),
      getExternalApplyDetection: vi.fn().mockResolvedValue(externalDetection),
      getExternalApplyUrl: vi
        .fn()
        .mockResolvedValue(
          "https://www.linkedin.com/safety/go/?url=https%3A%2F%2Fjobs.obilet.com%2Fapply%2F4456490821",
        ),
      openEasyApply: vi.fn().mockResolvedValue(undefined),
      collectQuestions: vi.fn().mockResolvedValue([]),
      collectVisibleJobs: vi.fn().mockResolvedValue([
        { url: externalJobUrl, alreadyApplied: false },
        { url: easyApplyJobUrl, alreadyApplied: false },
      ]),
      goToNextResultsPage: vi.fn().mockResolvedValue(false),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn().mockResolvedValue("submit"),
      advance: vi.fn(),
      dismissCompletionModal: vi.fn(),
    };
    const evaluateJob = vi
      .fn()
      .mockResolvedValueOnce({
        shouldApply: true,
        finalDecision: "APPLY",
        score: 91,
        reason: "Strong external fit.",
        policyAllowed: true,
        diagnostics: { applicationType: "external" },
      })
      .mockResolvedValueOnce({
        shouldApply: true,
        finalDecision: "APPLY",
        score: 88,
        reason: "Strong Easy Apply fit.",
        policyAllowed: true,
        diagnostics: { applicationType: "easy_apply" },
      });

    const result = await runEasyApplyBatchInternal(
      {
        driver,
        url: collectionUrl,
        targetCount: 2,
        externalApplyInspectionTimeoutMs: 50,
        candidateProfile: profile,
        evaluateJob,
        resolveAnswer: vi.fn(),
      },
      "dry-run",
    );

    expect(result.status).toBe("partial");
    expect(result.attemptedCount).toBe(2);
    expect(result.jobs[0]?.result).toMatchObject({
      status: "stopped_external_apply",
      externalApplyUrl: "https://jobs.obilet.com/apply/4456490821",
      externalDetection,
    });
    expect(result.jobs[1]?.result?.status).toBe("ready_to_submit");
    expect(driver.ensureAuthenticated).not.toHaveBeenCalledWith(externalJobUrl);
    expect(driver.open).not.toHaveBeenCalledWith(externalJobUrl);
    expect(driver.open).toHaveBeenCalledWith(easyApplyJobUrl);
    expect(driver.openEasyApply).toHaveBeenCalledTimes(1);
    expect(driver.isExternalApplyAvailable).toHaveBeenCalledTimes(1);
    expect(driver.isExternalApplyAvailable.mock.invocationCallOrder[0]).toBeGreaterThan(
      driver.inspectJobApplicationState.mock.invocationCallOrder[1] ?? 0,
    );
    expect(driver.getExternalApplyDetection).toHaveBeenCalledTimes(1);
    expect(driver.getExternalApplyUrl).toHaveBeenCalledTimes(1);
    expect(driver.resetAfterProcessingTimeout).not.toHaveBeenCalled();
    expect(driver.openCollection).toHaveBeenCalledWith(
      `${collectionUrl}?currentJobId=4456490821`,
    );
  });

  it("returns an explicit unknown result when an external target URL is unsafe", async () => {
    const externalJobUrl = "https://www.linkedin.com/jobs/view/4456490821";
    const driver = {
      open: vi.fn(),
      openCollection: vi.fn().mockResolvedValue(undefined),
      ensureAuthenticated: vi.fn().mockResolvedValue(undefined),
      resetAfterProcessingTimeout: vi.fn(),
      inspectJobApplicationState: vi.fn().mockResolvedValue("apply_available"),
      isEasyApplyAvailable: vi.fn(),
      isExternalApplyAvailable: vi.fn().mockResolvedValue(true),
      getExternalApplyDetection: vi.fn().mockResolvedValue({
        source: "explicit_company_website_cta",
        signals: ["selector:explicit_company_website_cta"],
      }),
      getExternalApplyUrl: vi.fn().mockResolvedValue("javascript:alert(1)"),
      openEasyApply: vi.fn(),
      collectQuestions: vi.fn(),
      collectVisibleJobs: vi.fn().mockResolvedValue([
        { url: externalJobUrl, alreadyApplied: false },
      ]),
      goToNextResultsPage: vi.fn().mockResolvedValue(false),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn(),
      advance: vi.fn(),
    };

    const result = await runEasyApplyBatchInternal(
      {
        driver,
        url: "https://www.linkedin.com/jobs/collections/easy-apply",
        targetCount: 1,
        externalApplyInspectionTimeoutMs: 50,
        candidateProfile: profile,
        evaluateJob: async () => ({
          shouldApply: true,
          finalDecision: "APPLY",
          score: 91,
          reason: "Strong external fit.",
          policyAllowed: true,
          diagnostics: { applicationType: "external" },
        }),
        resolveAnswer: vi.fn(),
      },
      "dry-run",
    );

    expect(result.status).toBe("partial");
    expect(result.jobs[0]?.result).toMatchObject({
      status: "stopped_unknown_action",
      failureReasonCode: "linkedin.external_apply_target_unverified",
      retryable: true,
    });
    expect(driver.ensureAuthenticated).not.toHaveBeenCalledWith(externalJobUrl);
    expect(driver.open).not.toHaveBeenCalled();
    expect(driver.isEasyApplyAvailable).not.toHaveBeenCalled();
    expect(driver.openEasyApply).not.toHaveBeenCalled();
    expect(driver.resetAfterProcessingTimeout).not.toHaveBeenCalled();
  });

  it("bounds external inspection, resets the page, and avoids the Easy Apply modal path", async () => {
    const externalJobUrl = "https://www.linkedin.com/jobs/view/4456490821";
    let releaseExternalInspection!: () => void;
    const externalInspection = new Promise<boolean>((resolve) => {
      releaseExternalInspection = () => resolve(true);
    });
    let externalInspectionDrained = false;
    const driver = {
      open: vi.fn(),
      openCollection: vi.fn().mockResolvedValue(undefined),
      ensureAuthenticated: vi.fn().mockResolvedValue(undefined),
      resetAfterProcessingTimeout: vi.fn(
        async (input?: EasyApplyProcessingTimeoutResetInput) => {
          releaseExternalInspection();
          await input?.waitForTimedOutOperations();
          externalInspectionDrained = true;
        },
      ),
      inspectJobApplicationState: vi.fn().mockResolvedValue("apply_available"),
      isEasyApplyAvailable: vi.fn(),
      isExternalApplyAvailable: vi.fn().mockReturnValue(externalInspection),
      getExternalApplyDetection: vi.fn(),
      getExternalApplyUrl: vi.fn(),
      openEasyApply: vi.fn(),
      collectQuestions: vi.fn(),
      collectVisibleJobs: vi.fn().mockResolvedValue([
        { url: externalJobUrl, alreadyApplied: false },
      ]),
      goToNextResultsPage: vi.fn().mockResolvedValue(false),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn(),
      advance: vi.fn(),
    };

    const result = await runEasyApplyBatchInternal(
      {
        driver,
        url: "https://www.linkedin.com/jobs/collections/easy-apply",
        targetCount: 1,
        externalApplyInspectionTimeoutMs: 25,
        collectionContextTimeoutMs: 50,
        candidateProfile: profile,
        evaluateJob: async () => ({
          shouldApply: true,
          finalDecision: "APPLY",
          score: 91,
          reason: "Strong external fit.",
          policyAllowed: true,
          diagnostics: { applicationType: "external" },
        }),
        resolveAnswer: vi.fn(),
      },
      "dry-run",
    );

    expect(result.jobs[0]?.result).toMatchObject({
      status: "stopped_unknown_action",
      failureReasonCode: "linkedin.external_apply_inspection_timeout",
      retryable: true,
      recovery: {
        attempted: true,
        succeeded: true,
      },
    });
    expect(driver.open).not.toHaveBeenCalled();
    expect(driver.openEasyApply).not.toHaveBeenCalled();
    expect(driver.resetAfterProcessingTimeout).toHaveBeenCalledTimes(1);
    expect(externalInspectionDrained).toBe(true);
    expect(driver.openCollection).toHaveBeenCalledTimes(2);
  });

  it("times out a stuck approved job and continues with the next job", async () => {
    let releaseTimedOutDriverCall!: () => void;
    const timedOutDriverCall = new Promise<void>((resolve) => {
      releaseTimedOutDriverCall = resolve;
    });
    let timedOutDriverCallDrained = false;
    const neverRestoresTimedOutJob = new Promise<void>(() => undefined);
    const driver = {
      open: vi.fn(),
      openCollection: vi.fn().mockImplementation((url: string) => {
        if (new URL(url).searchParams.get("currentJobId") === "1") {
          return neverRestoresTimedOutJob;
        }
        return Promise.resolve();
      }),
      ensureAuthenticated: vi.fn().mockResolvedValue(undefined),
      resetAfterProcessingTimeout: vi.fn(
        async (input?: EasyApplyProcessingTimeoutResetInput) => {
          releaseTimedOutDriverCall();
          await input?.waitForTimedOutOperations();
          timedOutDriverCallDrained = true;
        },
      ),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi
        .fn()
        .mockImplementationOnce(() => timedOutDriverCall)
        .mockResolvedValueOnce(undefined),
      collectQuestions: vi.fn().mockResolvedValue([]),
      collectVisibleJobs: vi.fn().mockResolvedValue([
        { url: "https://www.linkedin.com/jobs/view/1", alreadyApplied: false },
        { url: "https://www.linkedin.com/jobs/view/2", alreadyApplied: false },
      ]),
      goToNextResultsPage: vi.fn().mockResolvedValue(false),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn().mockResolvedValue("submit"),
      advance: vi.fn(),
      dismissCompletionModal: vi.fn(),
    };

    const result = await runEasyApplyBatchInternal(
      {
        driver,
        url: "https://www.linkedin.com/jobs/collections/easy-apply",
        targetCount: 2,
        jobProcessingTimeoutMs: 25,
        collectionContextTimeoutMs: 25,
        candidateProfile: profile,
        evaluateJob: async () => ({
          shouldApply: true,
          finalDecision: "APPLY",
          score: 90,
          reason: "Strong fit.",
          policyAllowed: true,
        }),
        resolveAnswer: vi.fn(),
      },
      "dry-run",
    );

    expect(result.status).toBe("partial");
    expect(result.attemptedCount).toBe(2);
    expect(result.jobs[0]?.result).toMatchObject({
      status: "stopped_unknown_action",
      failureReasonCode: "linkedin.approved_job_processing_timeout",
      retryable: true,
      recovery: {
        attempted: true,
        succeeded: true,
      },
    });
    expect(result.jobs[0]?.result?.stopReason).toContain("timed out after 25ms");
    expect(result.jobs[1]?.result?.status).toBe("ready_to_submit");
    expect(result.stopReason).toContain("1 attempt(s) stopped before completion");
    expect(driver.openEasyApply).toHaveBeenCalledTimes(2);
    expect(driver.resetAfterProcessingTimeout).toHaveBeenCalledTimes(1);
    expect(timedOutDriverCallDrained).toBe(true);
    expect(driver.resetAfterProcessingTimeout.mock.invocationCallOrder[0]).toBeLessThan(
      driver.openCollection.mock.invocationCallOrder[1] ?? Number.MAX_SAFE_INTEGER,
    );
    expect(driver.openCollection).not.toHaveBeenCalledWith(
      expect.stringContaining("currentJobId=1"),
    );
    expect(driver.open).toHaveBeenCalledWith("https://www.linkedin.com/jobs/view/2");
  });

  it("keeps the collection usable when an isolated processing page times out", async () => {
    const firstJobUrl = "https://www.linkedin.com/jobs/view/1";
    const secondJobUrl = "https://www.linkedin.com/jobs/view/2";
    const neverAuthenticates = new Promise<void>(() => undefined);
    const firstAttemptDispose = vi.fn().mockResolvedValue(undefined);
    const secondAttemptDispose = vi.fn().mockResolvedValue(undefined);
    const firstAttemptDriver = {
      open: vi.fn(),
      openCollection: vi.fn(),
      ensureAuthenticated: vi.fn().mockReturnValue(neverAuthenticates),
      isEasyApplyAvailable: vi.fn(),
      openEasyApply: vi.fn(),
      collectQuestions: vi.fn(),
      goToNextResultsPage: vi.fn(),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn(),
      advance: vi.fn(),
    };
    const secondAttemptDriver = {
      open: vi.fn().mockResolvedValue(undefined),
      openCollection: vi.fn(),
      ensureAuthenticated: vi.fn().mockResolvedValue(undefined),
      inspectJobApplicationState: vi.fn().mockResolvedValue("apply_available"),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn().mockResolvedValue(undefined),
      collectQuestions: vi.fn().mockResolvedValue([]),
      goToNextResultsPage: vi.fn(),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn().mockResolvedValue("submit"),
      advance: vi.fn(),
    };
    const collectionDriver = {
      open: vi.fn(),
      openCollection: vi.fn().mockResolvedValue(undefined),
      ensureAuthenticated: vi.fn().mockResolvedValue(undefined),
      createProcessingDriver: vi
        .fn()
        .mockResolvedValueOnce({
          driver: firstAttemptDriver,
          dispose: firstAttemptDispose,
        })
        .mockResolvedValueOnce({
          driver: secondAttemptDriver,
          dispose: secondAttemptDispose,
        }),
      resetAfterProcessingTimeout: vi.fn(),
      inspectJobApplicationState: vi.fn().mockResolvedValue("apply_available"),
      isEasyApplyAvailable: vi.fn(),
      openEasyApply: vi.fn(),
      collectQuestions: vi.fn(),
      collectVisibleJobs: vi.fn().mockResolvedValue([
        { url: firstJobUrl, alreadyApplied: false },
        { url: secondJobUrl, alreadyApplied: false },
      ]),
      goToNextResultsPage: vi.fn().mockResolvedValue(false),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn(),
      advance: vi.fn(),
    };

    const result = await runEasyApplyBatchInternal(
      {
        driver: collectionDriver,
        url: "https://www.linkedin.com/jobs/collections/easy-apply",
        targetCount: 2,
        jobProcessingTimeoutMs: 25,
        collectionContextTimeoutMs: 50,
        candidateProfile: profile,
        evaluateJob: async () => ({
          shouldApply: true,
          finalDecision: "APPLY",
          score: 90,
          reason: "Strong fit.",
          policyAllowed: true,
        }),
        resolveAnswer: vi.fn(),
      },
      "dry-run",
    );

    expect(result.status).toBe("partial");
    expect(result.attemptedCount).toBe(2);
    expect(result.jobs[0]?.result).toMatchObject({
      failureReasonCode: "linkedin.approved_job_processing_timeout",
      recovery: { attempted: true, succeeded: true },
    });
    expect(result.jobs[1]?.result?.status).toBe("ready_to_submit");
    expect(collectionDriver.resetAfterProcessingTimeout).not.toHaveBeenCalled();
    expect(firstAttemptDispose).toHaveBeenCalledTimes(1);
    expect(secondAttemptDispose).toHaveBeenCalledTimes(1);
    expect(collectionDriver.openCollection).toHaveBeenCalledWith(
      expect.stringContaining("currentJobId=1"),
    );
    expect(secondAttemptDriver.open).toHaveBeenCalledWith(secondJobUrl);
  });

  it("returns a bounded partial result when the timed-out page cannot be reset", async () => {
    const neverResolves = new Promise<void>(() => undefined);
    const driver = {
      open: vi.fn(),
      openCollection: vi.fn().mockResolvedValue(undefined),
      ensureAuthenticated: vi.fn().mockResolvedValue(undefined),
      resetAfterProcessingTimeout: vi.fn().mockRejectedValue(new Error("page close failed")),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn().mockReturnValue(neverResolves),
      collectQuestions: vi.fn().mockResolvedValue([]),
      collectVisibleJobs: vi.fn().mockResolvedValue([
        { url: "https://www.linkedin.com/jobs/view/1", alreadyApplied: false },
        { url: "https://www.linkedin.com/jobs/view/2", alreadyApplied: false },
      ]),
      goToNextResultsPage: vi.fn().mockResolvedValue(false),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn().mockResolvedValue("submit"),
      advance: vi.fn(),
      dismissCompletionModal: vi.fn(),
    };

    const result = await runEasyApplyBatchInternal(
      {
        driver,
        url: "https://www.linkedin.com/jobs/collections/easy-apply",
        targetCount: 2,
        jobProcessingTimeoutMs: 25,
        candidateProfile: profile,
        evaluateJob: async () => ({
          shouldApply: true,
          finalDecision: "APPLY",
          score: 90,
          reason: "Strong fit.",
          policyAllowed: true,
        }),
        resolveAnswer: vi.fn(),
      },
      "dry-run",
    );

    expect(result.status).toBe("partial");
    expect(result.attemptedCount).toBe(1);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.result).toMatchObject({
      failureReasonCode: "linkedin.approved_job_processing_timeout",
      recovery: {
        attempted: false,
        succeeded: false,
      },
    });
    expect(result.jobs[0]?.result?.recovery?.message).toContain("page close failed");
    expect(result.stopReason).toContain("driver context could not be safely reused");
    expect(driver.resetAfterProcessingTimeout).toHaveBeenCalledTimes(1);
    expect(driver.openCollection).toHaveBeenCalledTimes(1);
    expect(driver.open).not.toHaveBeenCalledWith("https://www.linkedin.com/jobs/view/2");
  });

  it("returns a bounded partial result when restoring collection context hangs after a successful job", async () => {
    const neverRestores = new Promise<void>(() => undefined);
    const driver = {
      open: vi.fn(),
      openCollection: vi.fn().mockImplementation((url: string) =>
        new URL(url).searchParams.has("currentJobId")
          ? neverRestores
          : Promise.resolve()
      ),
      ensureAuthenticated: vi.fn().mockResolvedValue(undefined),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn().mockResolvedValue(undefined),
      collectQuestions: vi.fn().mockResolvedValue([]),
      collectVisibleJobs: vi.fn().mockResolvedValue([
        { url: "https://www.linkedin.com/jobs/view/1", alreadyApplied: false },
        { url: "https://www.linkedin.com/jobs/view/2", alreadyApplied: false },
      ]),
      goToNextResultsPage: vi.fn().mockResolvedValue(false),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn().mockResolvedValue("submit"),
      advance: vi.fn(),
      dismissCompletionModal: vi.fn(),
    };

    const result = await runEasyApplyBatchInternal(
      {
        driver,
        url: "https://www.linkedin.com/jobs/collections/easy-apply",
        targetCount: 2,
        collectionContextTimeoutMs: 25,
        candidateProfile: profile,
        evaluateJob: async () => ({
          shouldApply: true,
          finalDecision: "APPLY",
          score: 90,
          reason: "Strong fit.",
          policyAllowed: true,
        }),
        resolveAnswer: vi.fn(),
      },
      "dry-run",
    );

    expect(result.status).toBe("partial");
    expect(result.attemptedCount).toBe(1);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.result?.status).toBe("ready_to_submit");
    expect(result.stopReason).toContain(
      "collection context restore timed out after 25ms",
    );
    expect(result.stopReason).toContain("driver context could not be safely reused");
    expect(driver.open).not.toHaveBeenCalledWith("https://www.linkedin.com/jobs/view/2");
    expect(driver.goToNextResultsPage).not.toHaveBeenCalled();
  });

  it("blocks late driver calls from a timed-out job after recovery starts", async () => {
    let resolveDelayedAnswer!: (answer: ResolvedAnswer) => void;
    const delayedAnswer = new Promise<ResolvedAnswer>((resolve) => {
      resolveDelayedAnswer = resolve;
    });
    const driver = {
      open: vi.fn(),
      openCollection: vi.fn().mockResolvedValue(undefined),
      ensureAuthenticated: vi.fn().mockResolvedValue(undefined),
      resetAfterProcessingTimeout: vi.fn().mockResolvedValue(undefined),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn().mockResolvedValue(undefined),
      collectQuestions: vi
        .fn()
        .mockResolvedValueOnce([
          {
            fieldKey: "salary",
            label: "Salary expectation",
            inputType: "text",
            required: true,
          },
        ])
        .mockResolvedValueOnce([]),
      collectVisibleJobs: vi.fn().mockResolvedValue([
        { url: "https://www.linkedin.com/jobs/view/1", alreadyApplied: false },
        { url: "https://www.linkedin.com/jobs/view/2", alreadyApplied: false },
      ]),
      goToNextResultsPage: vi.fn().mockResolvedValue(false),
      fillAnswer: vi.fn().mockResolvedValue({ filled: true }),
      getPrimaryAction: vi.fn().mockResolvedValue("submit"),
      advance: vi.fn(),
      dismissCompletionModal: vi.fn(),
    };

    const result = await runEasyApplyBatchInternal(
      {
        driver,
        url: "https://www.linkedin.com/jobs/collections/easy-apply",
        targetCount: 2,
        jobProcessingTimeoutMs: 25,
        collectionContextTimeoutMs: 25,
        candidateProfile: profile,
        evaluateJob: async () => ({
          shouldApply: true,
          finalDecision: "APPLY",
          score: 90,
          reason: "Strong fit.",
          policyAllowed: true,
        }),
        resolveAnswer: vi.fn().mockReturnValueOnce(delayedAnswer),
      },
      "dry-run",
    );

    expect(result.status).toBe("partial");
    expect(result.jobs[0]?.result?.failureReasonCode).toBe(
      "linkedin.approved_job_processing_timeout",
    );
    expect(result.jobs[1]?.result?.status).toBe("ready_to_submit");

    resolveDelayedAnswer({
      questionType: "salary",
      strategy: "generated",
      answer: "100000",
      confidence: 0.9,
      confidenceLabel: "high",
      source: "llm",
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(driver.fillAnswer).not.toHaveBeenCalled();
    expect(driver.resetAfterProcessingTimeout).toHaveBeenCalledTimes(1);
    expect(driver.openCollection).toHaveBeenCalledTimes(3);
    expect(driver.openCollection).not.toHaveBeenCalledWith(
      expect.stringContaining("currentJobId=1"),
    );
  });

  it("stops after consecutive pages produce no new unique jobs", async () => {
    const driver = {
      open: vi.fn(),
      openCollection: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn(),
      openEasyApply: vi.fn(),
      collectQuestions: vi.fn(),
      collectVisibleJobs: vi.fn().mockResolvedValue([
        { url: "https://www.linkedin.com/jobs/view/1", alreadyApplied: true },
      ]),
      goToNextResultsPage: vi.fn().mockResolvedValue(true),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn(),
      advance: vi.fn(),
    };

    const result = await runEasyApplyBatchInternal(
      {
        driver,
        url: "https://www.linkedin.com/jobs/collections/easy-apply",
        targetCount: 2,
        maxConsecutiveNoProgressPages: 2,
        candidateProfile: profile,
        evaluateJob: vi.fn(),
        resolveAnswer: vi.fn(),
      },
      "dry-run",
    );

    expect(result.status).toBe("partial");
    expect(result.pagesVisited).toBe(3);
    expect(result.stopReason).toContain("2 consecutive page(s) produced no new unique jobs");
    expect(driver.goToNextResultsPage).toHaveBeenCalledTimes(2);
  });

  it("stops at the configured global page limit", async () => {
    let pageNumber = 0;
    const driver = {
      open: vi.fn(),
      openCollection: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn(),
      openEasyApply: vi.fn(),
      collectQuestions: vi.fn(),
      collectVisibleJobs: vi.fn().mockImplementation(async () => {
        pageNumber += 1;
        return [
          {
            url: `https://www.linkedin.com/jobs/view/${pageNumber}`,
            alreadyApplied: true,
          },
        ];
      }),
      goToNextResultsPage: vi.fn().mockResolvedValue(true),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn(),
      advance: vi.fn(),
    };

    const result = await runEasyApplyBatchInternal(
      {
        driver,
        url: "https://www.linkedin.com/jobs/collections/easy-apply",
        targetCount: 1,
        maxPages: 2,
        candidateProfile: profile,
        evaluateJob: vi.fn(),
        resolveAnswer: vi.fn(),
      },
      "dry-run",
    );

    expect(result.status).toBe("partial");
    expect(result.pagesVisited).toBe(2);
    expect(result.jobs).toHaveLength(2);
    expect(result.stopReason).toContain("configured maximum of 2 page(s)");
    expect(driver.goToNextResultsPage).toHaveBeenCalledTimes(1);
  });

  it("uses submit mode to return submitted results for approved jobs", async () => {
    const driver = {
      open: vi.fn(),
      openCollection: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn(),
      collectQuestions: vi.fn().mockResolvedValue([]),
      collectVisibleJobs: vi.fn().mockResolvedValue([
        { url: "https://www.linkedin.com/jobs/view/1", alreadyApplied: false },
      ]),
      goToNextResultsPage: vi.fn().mockResolvedValue(false),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn().mockResolvedValue("submit"),
      advance: vi.fn(),
      dismissCompletionModal: vi.fn().mockResolvedValue(true),
    };

    const result = await runEasyApplyBatchInternal(
      {
        driver,
        url: "https://www.linkedin.com/jobs/collections/easy-apply",
        targetCount: 1,
        candidateProfile: profile,
        evaluateJob: async () => ({
          shouldApply: true,
          finalDecision: "APPLY",
          score: 90,
          reason: "Excellent fit.",
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
      },
      "submit",
    );

    expect(result.status).toBe("completed");
    expect(result.attemptedCount).toBe(1);
    expect(result.jobs[0]?.result?.status).toBe("submitted");
  });

  it("starts processing approved jobs immediately instead of waiting for the whole scan to finish", async () => {
    const driver = {
      open: vi.fn(),
      openCollection: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn(),
      collectQuestions: vi.fn().mockResolvedValue([]),
      collectVisibleJobs: vi
        .fn()
        .mockResolvedValueOnce([
          { url: "https://www.linkedin.com/jobs/view/1", alreadyApplied: false },
          { url: "https://www.linkedin.com/jobs/view/2", alreadyApplied: false },
        ])
        .mockResolvedValueOnce([
          { url: "https://www.linkedin.com/jobs/view/3", alreadyApplied: false },
        ]),
      goToNextResultsPage: vi.fn().mockResolvedValue(true),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn().mockResolvedValue("submit"),
      advance: vi.fn(),
      dismissCompletionModal: vi.fn().mockResolvedValue(true),
    };

    const evaluateJob = vi
      .fn()
      .mockResolvedValueOnce({
        shouldApply: true,
        finalDecision: "APPLY",
        score: 91,
        reason: "Excellent fit.",
        policyAllowed: true,
      })
      .mockResolvedValueOnce({
        shouldApply: true,
        finalDecision: "APPLY",
        score: 87,
        reason: "Excellent fit.",
        policyAllowed: true,
      });

    const result = await runEasyApplyBatchInternal(
      {
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
      },
      "submit",
    );

    expect(result.status).toBe("completed");
    expect(result.jobs[0]?.result?.status).toBe("submitted");
    expect(result.jobs[1]?.result?.status).toBe("submitted");
    expect(driver.open.mock.invocationCallOrder[0]).toBeGreaterThan(
      evaluateJob.mock.invocationCallOrder[0] ?? 0,
    );
    expect(driver.open.mock.invocationCallOrder[1]).toBeGreaterThan(
      evaluateJob.mock.invocationCallOrder[1] ?? 0,
    );
    expect(driver.goToNextResultsPage).not.toHaveBeenCalled();
    expect(evaluateJob).not.toHaveBeenCalledWith("https://www.linkedin.com/jobs/view/3");
  });

  it("processes an approved job before paginating to discover later matches", async () => {
    const driver = {
      open: vi.fn(),
      openCollection: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn(),
      collectQuestions: vi.fn().mockResolvedValue([]),
      collectVisibleJobs: vi
        .fn()
        .mockResolvedValueOnce([
          { url: "https://www.linkedin.com/jobs/view/1", alreadyApplied: false },
          { url: "https://www.linkedin.com/jobs/view/2", alreadyApplied: false },
        ])
        .mockResolvedValueOnce([
          { url: "https://www.linkedin.com/jobs/view/3", alreadyApplied: false },
        ]),
      goToNextResultsPage: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn().mockResolvedValue("submit"),
      advance: vi.fn(),
      dismissCompletionModal: vi.fn().mockResolvedValue(true),
    };

    const evaluateJob = vi
      .fn()
      .mockResolvedValueOnce({
        shouldApply: false,
        finalDecision: "SKIP",
        score: 19,
        reason: "Low fit.",
        policyAllowed: true,
      })
      .mockResolvedValueOnce({
        shouldApply: true,
        finalDecision: "APPLY",
        score: 84,
        reason: "Strong fit.",
        policyAllowed: true,
      })
      .mockResolvedValueOnce({
        shouldApply: true,
        finalDecision: "APPLY",
        score: 81,
        reason: "Strong fit.",
        policyAllowed: true,
      });

    const result = await runEasyApplyBatchInternal(
      {
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
      },
      "submit",
    );

    expect(result.status).toBe("completed");
    expect(result.attemptedCount).toBe(2);
    expect(driver.open.mock.invocationCallOrder[0]).toBeGreaterThan(
      evaluateJob.mock.invocationCallOrder[1] ?? 0,
    );
    expect(driver.goToNextResultsPage.mock.invocationCallOrder[0]).toBeGreaterThan(
      driver.open.mock.invocationCallOrder[0] ?? 0,
    );
    expect(result.jobs[1]?.result?.status).toBe("submitted");
    expect(result.jobs[2]?.result?.status).toBe("submitted");
  });

  it("restores the collection shell after an approved job so pagination can continue", async () => {
    const driver = {
      open: vi.fn(),
      openCollection: vi.fn().mockResolvedValue(undefined),
      ensureAuthenticated: vi.fn().mockResolvedValue(undefined),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn().mockResolvedValue(undefined),
      collectQuestions: vi.fn().mockResolvedValue([]),
      collectVisibleJobs: vi
        .fn()
        .mockResolvedValueOnce([
          { url: "https://www.linkedin.com/jobs/view/1", alreadyApplied: false },
        ])
        .mockResolvedValueOnce([
          { url: "https://www.linkedin.com/jobs/view/2", alreadyApplied: false },
        ]),
      goToNextResultsPage: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn().mockResolvedValue("submit"),
      advance: vi.fn(),
      dismissCompletionModal: vi.fn().mockResolvedValue(true),
    };

    const evaluateJob = vi
      .fn()
      .mockResolvedValueOnce({
        shouldApply: true,
        finalDecision: "APPLY",
        score: 80,
        reason: "Strong fit.",
        policyAllowed: true,
      })
      .mockResolvedValueOnce({
        shouldApply: false,
        finalDecision: "SKIP",
        score: 10,
        reason: "Low fit.",
        policyAllowed: true,
      });

    await runEasyApplyBatchInternal(
      {
        driver,
        url: "https://www.linkedin.com/jobs/collections/remote-jobs",
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
      },
      "submit",
    );

    expect(driver.openCollection).toHaveBeenCalledWith(
      "https://www.linkedin.com/jobs/collections/remote-jobs?currentJobId=1",
    );
    expect(driver.goToNextResultsPage).toHaveBeenCalled();
  });

  it("uses dry-run mode to stop at ready_to_submit for approved jobs", async () => {
    const driver = {
      open: vi.fn(),
      openCollection: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn(),
      collectQuestions: vi.fn().mockResolvedValue([]),
      collectVisibleJobs: vi.fn().mockResolvedValue([
        { url: "https://www.linkedin.com/jobs/view/1", alreadyApplied: false },
      ]),
      goToNextResultsPage: vi.fn().mockResolvedValue(false),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn().mockResolvedValue("submit"),
      advance: vi.fn(),
      dismissCompletionModal: vi.fn(),
    };

    const result = await runEasyApplyBatchInternal(
      {
        driver,
        url: "https://www.linkedin.com/jobs/collections/easy-apply",
        targetCount: 1,
        candidateProfile: profile,
        evaluateJob: async () => ({
          shouldApply: true,
          finalDecision: "APPLY",
          score: 90,
          reason: "Excellent fit.",
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
      },
      "dry-run",
    );

    expect(result.status).toBe("completed");
    expect(result.jobs[0]?.result?.status).toBe("ready_to_submit");
    expect(driver.advance).not.toHaveBeenCalledWith("submit");
  });

  it("stops before the next approved job when collection restore and recovery both fail", async () => {
    const driver = {
      open: vi.fn(),
      openCollection: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("collection reopen failed")),
      ensureAuthenticated: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("auth refresh failed")),
      isEasyApplyAvailable: vi.fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true),
      openEasyApply: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined),
      collectQuestions: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
      collectVisibleJobs: vi.fn().mockResolvedValue([
        { url: "https://www.linkedin.com/jobs/view/1", alreadyApplied: false },
        { url: "https://www.linkedin.com/jobs/view/2", alreadyApplied: false },
      ]),
      goToNextResultsPage: vi.fn().mockResolvedValue(false),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn().mockResolvedValue("submit"),
      advance: vi.fn(),
      dismissCompletionModal: vi.fn().mockResolvedValue(true),
    };

    const evaluation = {
      shouldApply: true as const,
      finalDecision: "APPLY" as const,
      score: 90,
      reason: "Excellent fit.",
      policyAllowed: true,
    };

    const result = await runEasyApplyBatchInternal(
      {
        driver,
        url: "https://www.linkedin.com/jobs/collections/easy-apply",
        targetCount: 2,
        candidateProfile: profile,
        evaluateJob: async () => evaluation,
        resolveAnswer: async () => ({
          questionType: "contact_info",
          strategy: "deterministic",
          answer: "123",
          confidence: 0.95,
          confidenceLabel: "high",
          source: "candidate-profile",
        }),
      },
      "submit",
    );

    expect(result.status).toBe("partial");
    expect(result.attemptedCount).toBe(1);
    expect(result.jobs[0]?.result?.status).toBe("submitted");
    expect(result.stopReason).toContain(
      "Collection restore failed for https://www.linkedin.com/jobs/view/1",
    );
    expect(result.stopReason).toContain("driver context could not be safely reused");
    expect(result.jobs).toHaveLength(1);
    expect(driver.open).not.toHaveBeenCalledWith("https://www.linkedin.com/jobs/view/2");
  });

  it("mentions recovery failures in the bounded partial batch stop reason", async () => {
    const driver = {
      open: vi.fn(),
      openCollection: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("collection reopen failed")),
      ensureAuthenticated: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("auth refresh failed")),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn().mockResolvedValue(undefined),
      collectQuestions: vi.fn().mockResolvedValue([]),
      collectVisibleJobs: vi.fn().mockResolvedValue([
        { url: "https://www.linkedin.com/jobs/view/1", alreadyApplied: false },
      ]),
      goToNextResultsPage: vi.fn().mockResolvedValue(false),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn().mockResolvedValue("unknown"),
      advance: vi.fn(),
      dismissCompletionModal: vi.fn(),
    };

    const result = await runEasyApplyBatchInternal(
      {
        driver,
        url: "https://www.linkedin.com/jobs/collections/easy-apply",
        targetCount: 2,
        candidateProfile: profile,
        evaluateJob: async () => ({
          shouldApply: true,
          finalDecision: "APPLY",
          score: 90,
          reason: "Excellent fit.",
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
      },
      "submit",
    );

    expect(result.status).toBe("partial");
    expect(result.stopReason).toContain("stopped before completion");
    expect(result.stopReason).toContain("recovery attempt(s) failed");
  });
});

describe("runEasyApply", () => {
  it("submits the application when the submit step is reached", async () => {
    const driver = {
      open: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn(),
      collectQuestions: vi.fn().mockResolvedValue([]),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn().mockResolvedValue("submit"),
      advance: vi.fn(),
      dismissCompletionModal: vi.fn().mockResolvedValue(true),
    };

    const result = await runEasyApply({
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

    expect(result.status).toBe("submitted");
    expect(driver.advance).toHaveBeenCalledWith("submit");
    expect(driver.dismissCompletionModal).toHaveBeenCalledTimes(1);
  });

  it("stops before submitting when the final step still has required manual-review blockers", async () => {
    const driver = {
      open: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn(),
      collectQuestions: vi.fn().mockResolvedValue([
        {
          fieldKey: "q1",
          label: "Salary expectation",
          inputType: "text",
          required: true,
        },
      ]),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn().mockResolvedValue("submit"),
      advance: vi.fn(),
      dismissCompletionModal: vi.fn(),
    };

    const result = await runEasyApply({
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
    });

    expect(result.status).toBe("stopped_manual_review");
    expect(driver.advance).not.toHaveBeenCalled();
    expect(driver.dismissCompletionModal).not.toHaveBeenCalled();
  });

  it("returns external-apply status when the job redirects to a company website", async () => {
    const driver = {
      open: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(false),
      isExternalApplyAvailable: vi.fn().mockResolvedValue(true),
      getExternalApplyUrl: vi.fn().mockResolvedValue("https://company.example.com/apply"),
      isAlreadyApplied: vi.fn().mockResolvedValue(false),
      openEasyApply: vi.fn(),
      collectQuestions: vi.fn(),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn(),
      advance: vi.fn(),
    };

    const result = await runEasyApply({
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

    expect(result.status).toBe("stopped_external_apply");
    expect(result.externalApplyUrl).toBe("https://company.example.com/apply");
  });

  it("stops when the job has already been applied to", async () => {
    const driver = {
      open: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(false),
      isExternalApplyAvailable: vi.fn().mockResolvedValue(false),
      isAlreadyApplied: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn(),
      collectQuestions: vi.fn(),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn(),
      advance: vi.fn(),
    };

    const result = await runEasyApply({
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

  it("stops when no apply path is available", async () => {
    const driver = {
      open: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(false),
      isExternalApplyAvailable: vi.fn().mockResolvedValue(false),
      isAlreadyApplied: vi.fn().mockResolvedValue(false),
      openEasyApply: vi.fn(),
      collectQuestions: vi.fn(),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn(),
      advance: vi.fn(),
    };

    const result = await runEasyApply({
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
    expect(result.stopReason).toContain("Easy Apply button was not found");
  });

  it("skips non-required manual-review answers and stops on unknown actions", async () => {
    const driver = {
      open: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn(),
      collectQuestions: vi.fn().mockResolvedValue([
        {
          fieldKey: "q1",
          label: "Optional note",
          inputType: "text",
          required: false,
        },
      ]),
      fillAnswer: vi.fn(),
      getPrimaryAction: vi.fn().mockResolvedValue("unknown"),
      advance: vi.fn(),
    };

    const result = await runEasyApply({
      driver,
      url: "https://www.linkedin.com/jobs/view/1",
      candidateProfile: profile,
      resolveAnswer: async () => ({
        questionType: "general_short_text",
        strategy: "needs-review",
        answer: null,
        confidence: 0.2,
        confidenceLabel: "manual_review",
        source: "manual",
      }),
    });

    expect(result.status).toBe("stopped_unknown_action");
    expect(result.steps[0]?.questions[0]?.details).toContain("manual review");
    expect(driver.fillAnswer).not.toHaveBeenCalled();
  });

  it("stops when review repeats without advancing", async () => {
    const driver = {
      open: vi.fn(),
      ensureAuthenticated: vi.fn(),
      isEasyApplyAvailable: vi.fn().mockResolvedValue(true),
      openEasyApply: vi.fn(),
      collectReviewDiagnostics: vi.fn().mockResolvedValue({
        validationMessages: ["Hidden validation blocker"],
        blockingFields: [],
        buttonStates: [
          {
            action: "review",
            visible: true,
            disabled: false,
            label: "Review",
          },
        ],
      }),
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

    const result = await runEasyApply({
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
    expect(result.reviewDiagnostics?.validationMessages).toContain(
      "Hidden validation blocker",
    );
  });
});
