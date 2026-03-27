import { describe, expect, it, vi } from "vitest";
import {
  chooseRadioValue,
  isAutoHandledQuestion,
  isManualReviewAnswer,
  isSubmitButtonLabel,
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
