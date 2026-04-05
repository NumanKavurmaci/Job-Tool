import { beforeEach, describe, expect, it, vi } from "vitest";
const { repairAnswerFromSiteFeedbackMock } = vi.hoisted(() => ({
  repairAnswerFromSiteFeedbackMock: vi.fn(),
}));
vi.mock("../../src/questions/strategies/aiCorrection.js", () => ({
  repairAnswerFromSiteFeedback: repairAnswerFromSiteFeedbackMock,
}));
import {
  collectExternalSiteFeedback,
  advanceExternalApplicationPage,
  fillExternalApplicationPage,
  getExternalPrimaryAction,
} from "../../src/external/fill.js";

const candidateProfile = {
  fullName: "Jane Doe",
  location: "Berlin",
  currentTitle: "Backend Engineer",
  yearsOfExperienceTotal: 4,
  skills: ["TypeScript"],
  languages: ["English"],
  linkedinUrl: "https://linkedin.com/in/jane",
  portfolioUrl: null,
  gpa: null,
  salaryExpectations: { usd: "85000", eur: null, try: null },
  resumeText: "Backend engineer.",
} as any;

beforeEach(() => {
  repairAnswerFromSiteFeedbackMock.mockReset();
  repairAnswerFromSiteFeedbackMock.mockResolvedValue(null);
});

function createLocatorRecorder() {
  const actions: Array<{ type: string; selector: string; value?: string }> = [];
  const presentSelectors = new Set<string>();

  const register = (...selectors: string[]) => {
    for (const selector of selectors) {
      presentSelectors.add(selector);
    }
  };

  const page = {
    async evaluate(callback: unknown) {
      if (typeof callback === "function") {
        return [];
      }
      return undefined;
    },
    locator(selector: string) {
      return {
        first() {
          return this;
        },
        async count() {
          return presentSelectors.has(selector) ? 1 : 0;
        },
        async click() {
          actions.push({ type: "click", selector });
        },
        async fill(value: string) {
          actions.push({ type: "fill", selector, value });
        },
        async press(value: string) {
          actions.push({ type: "press", selector, value });
        },
        async blur() {
          actions.push({ type: "blur", selector });
        },
        async setInputFiles(value: string) {
          actions.push({ type: "file", selector, value });
        },
      };
    },
    waitForTimeout: vi.fn(async () => undefined),
  };

  return { page, register, actions };
}

describe("external fill", () => {
  it("fills text, boolean-like select fields, uploads files and advances to next step", async () => {
    const { page, register, actions } = createLocatorRecorder();
    register(
      `[id="first-name"]`,
      `input[aria-label="Do you use AI to help you with coding?"]`,
      `[title="Yes"]`,
      `input[type="file"][aria-label="Upload your resume (only pdf)"]`,
      `button:has-text("Next")`,
    );

    const result = await fillExternalApplicationPage({
      page: page as never,
      discovery: {
        sourceUrl: "https://example.com/form",
        finalUrl: "https://example.com/form",
        pageTitle: "Form",
        platform: "generic",
        precursorLinks: [],
        followedPrecursorLink: null,
        fields: [
          {
            key: "first-name",
            label: "First Name",
            type: "short_text",
            required: true,
            options: [],
            placeholder: "First Name",
            helpText: null,
            accept: null,
          },
          {
            key: "ai-coding",
            label: "Do you use AI to help you with coding?",
            type: "boolean",
            required: true,
            options: ["Yes", "No"],
            placeholder: null,
            helpText: null,
            accept: null,
          },
          {
            key: "resume-upload",
            label: "Upload your resume (only pdf)",
            type: "file",
            required: true,
            options: [],
            placeholder: null,
            helpText: null,
            accept: "application/pdf,.pdf",
          },
        ],
      },
      answerPlan: [
        {
          fieldKey: "first-name",
          fieldLabel: "First Name",
          fieldType: "short_text",
          question: { label: "First Name", inputType: "short_text" },
          answer: "Jane",
          source: "candidate-profile",
          confidenceLabel: "high",
        },
        {
          fieldKey: "ai-coding",
          fieldLabel: "Do you use AI to help you with coding?",
          fieldType: "boolean",
          question: { label: "Do you use AI to help you with coding?", inputType: "boolean" },
          answer: "Yes",
          source: "candidate-profile",
          confidenceLabel: "high",
        },
        {
          fieldKey: "resume-upload",
          fieldLabel: "Upload your resume (only pdf)",
          fieldType: "file",
          question: { label: "Upload your resume (only pdf)", inputType: "file" },
          answer: "C:\\Users\\numan\\OneDrive\\Desktop\\Job Tool\\user\\resume.pdf",
          source: "candidate-profile",
          confidenceLabel: "high",
        },
      ],
      candidateProfile,
    });

    expect(result.primaryAction).toBe("next");
    expect(result.advanced).toBe(true);
    expect(result.blockingRequiredFields).toEqual([]);
    expect(result.siteFeedback.messages).toEqual([]);
    expect(actions).toEqual(
      expect.arrayContaining([
        { type: "fill", selector: `[id="first-name"]`, value: "Jane" },
        {
          type: "click",
          selector: `[title="Yes"]`,
        },
        {
          type: "file",
          selector: `input[type="file"][aria-label="Upload your resume (only pdf)"]`,
          value: "C:\\Users\\numan\\OneDrive\\Desktop\\Job Tool\\user\\resume.pdf",
        },
        { type: "click", selector: `button:has-text("Next")` },
      ]),
    );
  });

  it("falls back to typing when no visible option can be clicked", async () => {
    const { page, register, actions } = createLocatorRecorder();
    register(
      `input[aria-label="How about working part-time first?"]`,
      `button:has-text("Next")`,
    );

    const result = await fillExternalApplicationPage({
      page: page as never,
      discovery: {
        sourceUrl: "https://example.com/form",
        finalUrl: "https://example.com/form",
        pageTitle: "Form",
        platform: "generic",
        precursorLinks: [],
        followedPrecursorLink: null,
        fields: [
          {
            key: "part-time",
            label: "How about working part-time first?",
            type: "single_select",
            required: true,
            options: [],
            placeholder: null,
            helpText: null,
            accept: null,
          },
        ],
      },
      answerPlan: [
        {
          fieldKey: "part-time",
          fieldLabel: "How about working part-time first?",
          fieldType: "single_select",
          question: { label: "How about working part-time first?", inputType: "single_select" },
          answer: "No",
          source: "llm",
          confidenceLabel: "medium",
        },
      ],
      candidateProfile,
    });

    expect(result.fieldResults[0]).toEqual(
      expect.objectContaining({
        status: "filled",
        details: "Filled a selectable field.",
      }),
    );
    expect(actions).toEqual(
      expect.arrayContaining([
        { type: "fill", selector: `input[aria-label="How about working part-time first?"]`, value: "No" },
        { type: "press", selector: `input[aria-label="How about working part-time first?"]`, value: "Enter" },
      ]),
    );
  });

  it("normalizes url answers before filling url fields", async () => {
    const { page, register, actions } = createLocatorRecorder();
    register(`input[aria-label="LinkedIN Profile"]`, `button:has-text("Next")`);

    const result = await fillExternalApplicationPage({
      page: page as never,
      discovery: {
        sourceUrl: "https://example.com/form",
        finalUrl: "https://example.com/form",
        pageTitle: "Form",
        platform: "generic",
        precursorLinks: [],
        followedPrecursorLink: null,
        fields: [
          {
            key: "linkedin",
            label: "LinkedIN Profile",
            type: "url",
            required: false,
            options: [],
            placeholder: null,
            helpText: null,
            accept: null,
          },
        ],
      },
      answerPlan: [
        {
          fieldKey: "linkedin",
          fieldLabel: "LinkedIN Profile",
          fieldType: "url",
          question: { label: "LinkedIN Profile", inputType: "url" },
          answer: "https://www.linkedin.com/in/numan-kavurmacı-227a35247",
          source: "candidate-profile",
          confidenceLabel: "high",
        },
      ],
      candidateProfile,
    });

    expect(result.fieldResults[0]).toEqual(
      expect.objectContaining({
        status: "filled",
        details: "Filled the field.",
      }),
    );
    expect(actions).toEqual(
      expect.arrayContaining([
        {
          type: "fill",
          selector: `input[aria-label="LinkedIN Profile"]`,
          value: "https://www.linkedin.com/in/numan-kavurmac%C4%B1-227a35247",
        },
      ]),
    );
  });

  it("does not advance when a required field cannot be filled", async () => {
    const { page, register } = createLocatorRecorder();
    register(`[id="salary"]`, `button:has-text("Next")`);

    const result = await fillExternalApplicationPage({
      page: page as never,
      discovery: {
        sourceUrl: "https://example.com/form",
        finalUrl: "https://example.com/form",
        pageTitle: "Form",
        platform: "generic",
        precursorLinks: [],
        followedPrecursorLink: null,
        fields: [
          {
            key: "salary",
            label: "Salary",
            type: "number",
            required: true,
            options: [],
            placeholder: null,
            helpText: null,
            accept: null,
          },
        ],
      },
      answerPlan: [],
      candidateProfile,
    });

    expect(result.advanced).toBe(false);
    expect(result.blockingRequiredFields).toEqual(["Salary"]);
    expect(result.siteFeedback.messages).toEqual([]);
  });

  it("collects visible site feedback from the external application page", async () => {
    const page = {
      evaluate: vi.fn(async (callback: unknown) => {
        if (typeof callback === "function") {
          return [
            {
              severity: "error",
              message: "Salary must be a number",
              source: "external.apply",
            },
            {
              severity: "warning",
              message: "Please review your uploaded resume",
              source: "external.apply",
            },
          ];
        }
        return [];
      }),
    };

    const result = await collectExternalSiteFeedback(page as never);

    expect(result.errors).toEqual(["Salary must be a number"]);
    expect(result.warnings).toEqual(["Please review your uploaded resume"]);
    expect(result.messages).toHaveLength(2);
  });

  it("retries a failed external field with an AI-corrected value", async () => {
    repairAnswerFromSiteFeedbackMock.mockResolvedValueOnce({
      questionType: "salary",
      strategy: "generated",
      answer: "85000",
      confidence: 0.8,
      confidenceLabel: "high",
      source: "llm",
    });

    const actions: Array<{ type: string; selector: string; value?: string }> = [];
    let callbackPass = 0;
    const page = {
      async evaluate(callback: unknown) {
        if (typeof callback === "function") {
          callbackPass += 1;
          if (callbackPass === 1) {
            return "";
          }
          if (callbackPass === 2) {
            return [{ severity: "error", message: "Salary must be a number", source: "external.apply" }];
          }
          return [];
        }
        return undefined;
      },
      locator(selector: string) {
        return {
          first() {
            return this;
          },
          async count() {
            return selector === `[id="salary"]` || selector === `button:has-text("Next")` ? 1 : 0;
          },
          async click() {
            actions.push({ type: "click", selector });
          },
          async fill(value: string) {
            actions.push({ type: "fill", selector, value });
          },
          async blur() {
            actions.push({ type: "blur", selector });
          },
          async press() {
            return undefined;
          },
          async setInputFiles() {
            return undefined;
          },
        };
      },
      waitForTimeout: vi.fn(async () => undefined),
    };

    const result = await fillExternalApplicationPage({
      page: page as never,
      discovery: {
        sourceUrl: "https://example.com/form",
        finalUrl: "https://example.com/form",
        pageTitle: "Form",
        platform: "generic",
        precursorLinks: [],
        followedPrecursorLink: null,
        fields: [
          {
            key: "salary",
            label: "Salary",
            type: "number",
            required: true,
            options: [],
            placeholder: null,
            helpText: null,
            accept: null,
          },
        ],
      },
      answerPlan: [
        {
          fieldKey: "salary",
          fieldLabel: "Salary",
          fieldType: "number",
          question: { label: "Salary", inputType: "text" },
          answer: "negotiable",
          source: "llm",
          confidenceLabel: "medium",
        },
      ],
      candidateProfile,
    });

    expect(repairAnswerFromSiteFeedbackMock).toHaveBeenCalledWith(
      expect.objectContaining({
        validationFeedback: "Salary must be a number",
      }),
    );
    expect(result.fieldResults[0]).toEqual(
      expect.objectContaining({
        status: "filled",
        details: "Filled the field after AI corrected the value using site feedback.",
      }),
    );
    expect(actions).toEqual(
      expect.arrayContaining([
        { type: "fill", selector: `[id="salary"]`, value: "negotiable" },
        { type: "fill", selector: `[id="salary"]`, value: "85000" },
      ]),
    );
  });

  it("does not retry external correction when AI returns the same answer", async () => {
    repairAnswerFromSiteFeedbackMock.mockResolvedValueOnce({
      questionType: "salary",
      strategy: "generated",
      answer: "negotiable",
      confidence: 0.8,
      confidenceLabel: "high",
      source: "llm",
    });

    const actions: Array<{ type: string; selector: string; value?: string }> = [];
    let callbackPass = 0;
    const page = {
      async evaluate(callback: unknown) {
        if (typeof callback === "function") {
          callbackPass += 1;
          if (callbackPass === 1) {
            return "";
          }
          return [{ severity: "error", message: "Salary must be a number", source: "external.apply" }];
        }
        return undefined;
      },
      locator(selector: string) {
        return {
          first() {
            return this;
          },
          async count() {
            return selector === `[id="salary"]` ? 1 : 0;
          },
          async click() {
            actions.push({ type: "click", selector });
          },
          async fill(value: string) {
            actions.push({ type: "fill", selector, value });
          },
          async blur() {
            actions.push({ type: "blur", selector });
          },
          async press() {
            return undefined;
          },
          async setInputFiles() {
            return undefined;
          },
        };
      },
      waitForTimeout: vi.fn(async () => undefined),
    };

    const result = await fillExternalApplicationPage({
      page: page as never,
      discovery: {
        sourceUrl: "https://example.com/form",
        finalUrl: "https://example.com/form",
        pageTitle: "Form",
        platform: "generic",
        precursorLinks: [],
        followedPrecursorLink: null,
        fields: [
          {
            key: "salary",
            label: "Salary",
            type: "number",
            required: true,
            options: [],
            placeholder: null,
            helpText: null,
            accept: null,
          },
        ],
      },
      answerPlan: [
        {
          fieldKey: "salary",
          fieldLabel: "Salary",
          fieldType: "number",
          question: { label: "Salary", inputType: "text" },
          answer: "negotiable",
          source: "llm",
          confidenceLabel: "medium",
        },
      ],
      candidateProfile,
    });

    expect(result.fieldResults[0]).toEqual(
      expect.objectContaining({
        status: "failed",
        details: "Salary must be a number",
      }),
    );
    expect(actions.filter((action) => action.type === "fill")).toHaveLength(1);
  });

  it("returns the second error when corrected external value is still rejected", async () => {
    repairAnswerFromSiteFeedbackMock.mockResolvedValueOnce({
      questionType: "salary",
      strategy: "generated",
      answer: "85000",
      confidence: 0.8,
      confidenceLabel: "high",
      source: "llm",
    });

    const actions: Array<{ type: string; selector: string; value?: string }> = [];
    let callbackPass = 0;
    const page = {
      async evaluate(callback: unknown) {
        if (typeof callback === "function") {
          callbackPass += 1;
          if (callbackPass === 1) {
            return "";
          }
          if (callbackPass === 2) {
            return [{ severity: "error", message: "Salary must be a number", source: "external.apply" }];
          }
          return [{ severity: "error", message: "Salary exceeds the maximum", source: "external.apply" }];
        }
        return undefined;
      },
      locator(selector: string) {
        return {
          first() {
            return this;
          },
          async count() {
            return selector === `[id="salary"]` ? 1 : 0;
          },
          async click() {
            actions.push({ type: "click", selector });
          },
          async fill(value: string) {
            actions.push({ type: "fill", selector, value });
          },
          async blur() {
            actions.push({ type: "blur", selector });
          },
          async press() {
            return undefined;
          },
          async setInputFiles() {
            return undefined;
          },
        };
      },
      waitForTimeout: vi.fn(async () => undefined),
    };

    const result = await fillExternalApplicationPage({
      page: page as never,
      discovery: {
        sourceUrl: "https://example.com/form",
        finalUrl: "https://example.com/form",
        pageTitle: "Form",
        platform: "generic",
        precursorLinks: [],
        followedPrecursorLink: null,
        fields: [
          {
            key: "salary",
            label: "Salary",
            type: "number",
            required: true,
            options: [],
            placeholder: null,
            helpText: null,
            accept: null,
          },
        ],
      },
      answerPlan: [
        {
          fieldKey: "salary",
          fieldLabel: "Salary",
          fieldType: "number",
          question: { label: "Salary", inputType: "text" },
          answer: "negotiable",
          source: "llm",
          confidenceLabel: "medium",
        },
      ],
      candidateProfile,
    });

    expect(result.fieldResults[0]).toEqual(
      expect.objectContaining({
        status: "failed",
        details: "Salary exceeds the maximum",
      }),
    );
    expect(actions.filter((action) => action.type === "fill")).toHaveLength(2);
  });

  it("continues without retrying when external AI repair throws", async () => {
    repairAnswerFromSiteFeedbackMock.mockRejectedValueOnce(new Error("llm down"));

    let callbackPass = 0;
    const page = {
      async evaluate(callback: unknown) {
        if (typeof callback === "function") {
          callbackPass += 1;
          if (callbackPass === 1) {
            return "";
          }
          return [{ severity: "error", message: "Salary must be a number", source: "external.apply" }];
        }
        return undefined;
      },
      locator(selector: string) {
        return {
          first() {
            return this;
          },
          async count() {
            return selector === `[id="salary"]` ? 1 : 0;
          },
          async click() {
            return undefined;
          },
          async fill() {
            return undefined;
          },
          async blur() {
            return undefined;
          },
          async press() {
            return undefined;
          },
          async setInputFiles() {
            return undefined;
          },
        };
      },
      waitForTimeout: vi.fn(async () => undefined),
    };

    const result = await fillExternalApplicationPage({
      page: page as never,
      discovery: {
        sourceUrl: "https://example.com/form",
        finalUrl: "https://example.com/form",
        pageTitle: "Form",
        platform: "generic",
        precursorLinks: [],
        followedPrecursorLink: null,
        fields: [
          {
            key: "salary",
            label: "Salary",
            type: "number",
            required: true,
            options: [],
            placeholder: null,
            helpText: null,
            accept: null,
          },
        ],
      },
      answerPlan: [
        {
          fieldKey: "salary",
          fieldLabel: "Salary",
          fieldType: "number",
          question: { label: "Salary", inputType: "text" },
          answer: "negotiable",
          source: "llm",
          confidenceLabel: "medium",
        },
      ],
      candidateProfile,
    });

    expect(result.fieldResults[0]).toEqual(
      expect.objectContaining({
        status: "failed",
        details: "Salary must be a number",
      }),
    );
  });

  it("detects submit and next primary actions", async () => {
    const next = createLocatorRecorder();
    next.register(`button:has-text("Next")`);
    await expect(getExternalPrimaryAction(next.page as never)).resolves.toBe("next");

    const submit = createLocatorRecorder();
    submit.register(`button:has-text("Submit")`);
    await expect(getExternalPrimaryAction(submit.page as never)).resolves.toBe("submit");
  });

  it("clicks the submit button when asked to advance explicitly", async () => {
    const { page, register, actions } = createLocatorRecorder();
    register(`button:has-text("Submit")`);

    await expect(advanceExternalApplicationPage(page as never, "submit")).resolves.toBe(true);
    expect(actions).toContainEqual({ type: "click", selector: `button:has-text("Submit")` });
  });
});
