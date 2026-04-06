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
  const nativeSelectSelectors = new Set<string>();

  const register = (...selectors: string[]) => {
    for (const selector of selectors) {
      presentSelectors.add(selector);
    }
  };

  const registerNativeSelect = (...selectors: string[]) => {
    for (const selector of selectors) {
      presentSelectors.add(selector);
      nativeSelectSelectors.add(selector);
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
        async pressSequentially(value: string) {
          actions.push({ type: "pressSequentially", selector, value });
        },
        async selectOption(value: unknown) {
          if (!nativeSelectSelectors.has(selector)) {
            throw new Error("not a native select");
          }
          actions.push({
            type: "selectOption",
            selector,
            value:
              typeof value === "string"
                ? value
                : JSON.stringify(value),
          });
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

  return { page, register, registerNativeSelect, actions };
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

  it("uses ArrowDown plus Enter when filling a react-select style single select", async () => {
    const { page, register, actions } = createLocatorRecorder();
    register(
      `[id="react-select-1-input"]`,
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
            key: "react-select-1-input",
            label: "countryCode",
            type: "single_select",
            semanticKey: "phone.country_code",
            selectorHints: [`[id="react-select-1-input"]`],
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
          fieldKey: "react-select-1-input",
          fieldLabel: "countryCode",
          fieldType: "single_select",
          semanticKey: "phone.country_code",
          question: { label: "countryCode", inputType: "single_select" },
          answer: "Turkey (+90)",
          source: "candidate-profile",
          confidenceLabel: "high",
          resolutionStrategy: "semantic:phone-country-code",
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
        { type: "fill", selector: `[id="react-select-1-input"]`, value: "Turkey (+90)" },
        { type: "press", selector: `[id="react-select-1-input"]`, value: "ArrowDown" },
        { type: "press", selector: `[id="react-select-1-input"]`, value: "Enter" },
      ]),
    );
  });

  it("selects a city autocomplete option after filling a city-of-residence field", async () => {
    const { page, register, actions } = createLocatorRecorder();
    register(
      `[name="city"]`,
      `.places-autocomplete_optionsContainer__0VVTk:has-text("Samsun, Turkey")`,
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
            key: "city",
            label: "City of residence",
            type: "short_text",
            semanticKey: "location.city",
            required: true,
            options: [],
            placeholder: "City of residence",
            helpText: null,
            accept: null,
          },
        ],
      },
      answerPlan: [
        {
          fieldKey: "city",
          fieldLabel: "City of residence",
          fieldType: "short_text",
          semanticKey: "location.city",
          question: { label: "City of residence", inputType: "short_text" },
          answer: "Samsun, Turkey",
          source: "candidate-profile",
          confidenceLabel: "high",
          resolutionStrategy: "semantic:location-city",
        },
      ],
      candidateProfile,
    });

    expect(result.fieldResults[0]).toEqual(
      expect.objectContaining({
        status: "filled",
      }),
    );
    expect(actions).toEqual(
      expect.arrayContaining([
        { type: "pressSequentially", selector: `[name="city"]`, value: "Samsun, Turkey" },
        { type: "click", selector: `.places-autocomplete_optionsContainer__0VVTk:has-text("Samsun, Turkey")` },
      ]),
    );
  });

  it("falls back to ArrowDown plus Enter when no city autocomplete option is visible", async () => {
    const { page, register, actions } = createLocatorRecorder();
    register(
      `[name="city"]`,
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
            key: "city",
            label: "City of residence",
            type: "short_text",
            semanticKey: "location.city",
            required: true,
            options: [],
            placeholder: "City of residence",
            helpText: null,
            accept: null,
          },
        ],
      },
      answerPlan: [
        {
          fieldKey: "city",
          fieldLabel: "City of residence",
          fieldType: "short_text",
          semanticKey: "location.city",
          question: { label: "City of residence", inputType: "short_text" },
          answer: "Istanbul, Turkey",
          source: "candidate-profile",
          confidenceLabel: "high",
          resolutionStrategy: "semantic:location-city",
        },
      ],
      candidateProfile,
    });

    expect(result.fieldResults[0]).toEqual(
      expect.objectContaining({
        status: "filled",
      }),
    );
    expect(actions).toEqual(
      expect.arrayContaining([
        { type: "pressSequentially", selector: `[name="city"]`, value: "Istanbul, Turkey" },
        { type: "press", selector: `[name="city"]`, value: "ArrowDown" },
        { type: "press", selector: `[name="city"]`, value: "Enter" },
      ]),
    );
  });

  it("leaves a boolean field unselected when the normalized answer is negative", async () => {
    const { page, register, actions } = createLocatorRecorder();
    register(`[name="privacyConsent"]`, `button:has-text("Next")`);

    const result = await fillExternalApplicationPage({
      page: page as never,
      discovery: {
        sourceUrl: "https://example.com/form",
        finalUrl: "https://example.com/form",
        pageTitle: "Consent form",
        platform: "generic",
        precursorLinks: [],
        followedPrecursorLink: null,
        fields: [
          {
            key: "privacyConsent",
            label: "Privacy consent",
            type: "boolean",
            required: false,
            options: ["Yes", "No"],
            placeholder: null,
            helpText: null,
            accept: null,
          },
        ],
      },
      answerPlan: [
        {
          fieldKey: "privacyConsent",
          fieldLabel: "Privacy consent",
          fieldType: "boolean",
          question: { label: "Privacy consent", inputType: "boolean", options: ["Yes", "No"] },
          answer: "No",
          source: "candidate-profile",
          confidenceLabel: "high",
        },
      ],
      candidateProfile,
    });

    expect(result.fieldResults[0]).toEqual(
      expect.objectContaining({
        status: "filled",
        details: "Left the boolean field unselected.",
      }),
    );
    expect(actions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "click", selector: `[name="privacyConsent"]` }),
      ]),
    );
  });

  it("selects a self-describing selectable control when the answer is affirmative", async () => {
    const { page, register, actions } = createLocatorRecorder();
    register(`label:has-text("I'm actively looking for a job")`, `button:has-text("Next")`);

    const result = await fillExternalApplicationPage({
      page: page as never,
      discovery: {
        sourceUrl: "https://example.com/form",
        finalUrl: "https://example.com/form",
        pageTitle: "Availability form",
        platform: "generic",
        precursorLinks: [],
        followedPrecursorLink: null,
        fields: [
          {
            key: "availability",
            label: "I'm actively looking for a job",
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
          fieldKey: "availability",
          fieldLabel: "I'm actively looking for a job",
          fieldType: "single_select",
          question: { label: "I'm actively looking for a job", inputType: "single_select" },
          answer: "Yes",
          source: "candidate-profile",
          confidenceLabel: "high",
        },
      ],
      candidateProfile,
    });

    expect(result.fieldResults[0]).toEqual(
      expect.objectContaining({
        status: "filled",
        details: "Selected a labeled control.",
      }),
    );
    expect(actions).toEqual(
      expect.arrayContaining([
        { type: "click", selector: `label:has-text("I'm actively looking for a job")` },
      ]),
    );
  });

  it("uses native selectOption for real select controls discovered via selector hints", async () => {
    const { page, registerNativeSelect, actions } = createLocatorRecorder();
    registerNativeSelect(
      `[name="salaryCurrency"]`,
      `button:has-text("Next")`,
    );

    const result = await fillExternalApplicationPage({
      page: page as never,
      discovery: {
        sourceUrl: "https://example.com/form",
        finalUrl: "https://example.com/form",
        pageTitle: "Form",
        platform: "generic",
        precursorPage: false,
        precursorSignals: [],
        precursorLinks: [],
        followedPrecursorLink: null,
        fields: [
          {
            key: "salaryCurrency",
            label: "Desired Salary",
            type: "single_select",
            semanticKey: "salary.currency",
            semanticSignals: ["key:salary", "options:currency"],
            semanticConfidence: "high",
            selectorHints: [`[name="salaryCurrency"]`],
            required: false,
            options: ["US Dollar ($)", "Turkish Lira (TL)"],
            placeholder: null,
            helpText: null,
            accept: null,
          },
        ],
      },
      answerPlan: [
        {
          fieldKey: "salaryCurrency",
          fieldLabel: "Desired Salary",
          fieldType: "single_select",
          semanticKey: "salary.currency",
          question: { label: "Desired Salary", inputType: "single_select", options: ["US Dollar ($)", "Turkish Lira (TL)"] },
          answer: "Turkish Lira (TL)",
          source: "candidate-profile",
          confidenceLabel: "high",
          resolutionStrategy: "semantic:salary-currency",
        },
      ],
      candidateProfile,
    });

    expect(result.fieldResults[0]).toEqual(
      expect.objectContaining({
        status: "filled",
        details: "Selected a native option.",
      }),
    );
    expect(actions).toEqual(
      expect.arrayContaining([
        {
          type: "selectOption",
          selector: `[name="salaryCurrency"]`,
          value: JSON.stringify({ label: "Turkish Lira (TL)" }),
        },
      ]),
    );
  });

  it("handles a single-step submit form with semantic portfolio, salary and privacy fields", async () => {
    const { page, register, registerNativeSelect, actions } = createLocatorRecorder();
    register(
      `[name="candidate_name"]`,
      `[name="candidate_email"]`,
      `[name="candidate_portfolio"]`,
      `[name="candidate_salary_amount"]`,
      `input[type="file"][aria-label="Resume"]`,
      `button:has-text("Submit application")`,
    );
    registerNativeSelect(`[name="candidate_salary_currency"]`);

    const result = await fillExternalApplicationPage({
      page: page as never,
      discovery: {
        sourceUrl: "https://example.com/workable-single-step",
        finalUrl: "https://example.com/workable-single-step",
        pageTitle: "Single-step application",
        platform: "workable",
        precursorPage: false,
        precursorSignals: [],
        precursorLinks: [],
        followedPrecursorLink: null,
        fields: [
          {
            key: "candidate_name",
            label: "Full name",
            type: "short_text",
            required: true,
            options: [],
            placeholder: "Full name",
            helpText: null,
            accept: null,
          },
          {
            key: "candidate_email",
            label: "Email",
            type: "email",
            required: true,
            options: [],
            placeholder: "Email",
            helpText: null,
            accept: null,
          },
          {
            key: "candidate_portfolio",
            label: "Portfolio URL",
            type: "url",
            semanticKey: "profile.portfolio",
            required: false,
            options: [],
            placeholder: "Portfolio URL",
            helpText: null,
            accept: null,
          },
          {
            key: "candidate_salary_currency",
            label: "Salary currency",
            type: "single_select",
            semanticKey: "salary.currency",
            semanticSignals: ["options:currency"],
            semanticConfidence: "high",
            selectorHints: [`[name="candidate_salary_currency"]`],
            required: false,
            options: ["US Dollar ($)", "Turkish Lira (TL)"],
            placeholder: null,
            helpText: null,
            accept: null,
          },
          {
            key: "candidate_salary_amount",
            label: "Expected salary",
            type: "number",
            semanticKey: "salary.amount",
            required: false,
            options: [],
            placeholder: "Expected salary",
            helpText: null,
            accept: null,
          },
          {
            key: "candidate_resume",
            label: "Resume",
            type: "file",
            semanticKey: "resume.upload",
            required: false,
            options: [],
            placeholder: null,
            helpText: null,
            accept: ".pdf",
          },
          {
            key: "candidate_privacy",
            label: "I agree to the privacy policy",
            type: "boolean",
            semanticKey: "consent.privacy",
            required: false,
            options: ["Yes", "No"],
            placeholder: null,
            helpText: null,
            accept: null,
          },
        ],
      },
      answerPlan: [
        {
          fieldKey: "candidate_name",
          fieldLabel: "Full name",
          fieldType: "short_text",
          question: { label: "Full name", inputType: "short_text" },
          answer: "Jane Doe",
          source: "candidate-profile",
          confidenceLabel: "high",
        },
        {
          fieldKey: "candidate_email",
          fieldLabel: "Email",
          fieldType: "email",
          question: { label: "Email", inputType: "email" },
          answer: "jane@example.com",
          source: "candidate-profile",
          confidenceLabel: "high",
        },
        {
          fieldKey: "candidate_portfolio",
          fieldLabel: "Portfolio URL",
          fieldType: "url",
          semanticKey: "profile.portfolio",
          question: { label: "Portfolio URL", inputType: "url" },
          answer: "https://jane.dev",
          source: "candidate-profile",
          confidenceLabel: "high",
          resolutionStrategy: "semantic:profile-portfolio",
        },
        {
          fieldKey: "candidate_salary_currency",
          fieldLabel: "Salary currency",
          fieldType: "single_select",
          semanticKey: "salary.currency",
          question: {
            label: "Salary currency",
            inputType: "single_select",
            options: ["US Dollar ($)", "Turkish Lira (TL)"],
          },
          answer: "US Dollar ($)",
          source: "candidate-profile",
          confidenceLabel: "high",
          resolutionStrategy: "semantic:salary-currency",
        },
        {
          fieldKey: "candidate_salary_amount",
          fieldLabel: "Expected salary",
          fieldType: "number",
          semanticKey: "salary.amount",
          question: { label: "Expected salary", inputType: "number" },
          answer: "85000",
          source: "candidate-profile",
          confidenceLabel: "high",
          resolutionStrategy: "semantic:salary-amount",
        },
        {
          fieldKey: "candidate_resume",
          fieldLabel: "Resume",
          fieldType: "file",
          semanticKey: "resume.upload",
          question: { label: "Resume", inputType: "file" },
          answer: "C:\\Users\\numan\\OneDrive\\Desktop\\Job Tool\\user\\resume.pdf",
          source: "candidate-profile",
          confidenceLabel: "high",
          resolutionStrategy: "semantic:resume-upload",
        },
        {
          fieldKey: "candidate_privacy",
          fieldLabel: "I agree to the privacy policy",
          fieldType: "boolean",
          semanticKey: "consent.privacy",
          question: { label: "I agree to the privacy policy", inputType: "boolean", options: ["Yes", "No"] },
          answer: null,
          source: "manual",
          confidenceLabel: "manual_review",
          resolutionStrategy: "semantic:consent.privacy",
        },
      ],
      candidateProfile,
      submit: true,
    });

    expect(result.primaryAction).toBe("submit");
    expect(result.advanced).toBe(true);
    expect(result.blockingRequiredFields).toEqual([]);
    expect(result.fieldResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldKey: "candidate_name", status: "filled" }),
        expect.objectContaining({ fieldKey: "candidate_email", status: "filled" }),
        expect.objectContaining({ fieldKey: "candidate_portfolio", status: "filled" }),
        expect.objectContaining({ fieldKey: "candidate_salary_currency", details: "Selected a native option." }),
        expect.objectContaining({ fieldKey: "candidate_salary_amount", status: "filled" }),
        expect.objectContaining({ fieldKey: "candidate_resume", status: "filled" }),
        expect.objectContaining({ fieldKey: "candidate_privacy", status: "skipped" }),
      ]),
    );
    expect(actions).toEqual(
      expect.arrayContaining([
        { type: "fill", selector: `[name="candidate_name"]`, value: "Jane Doe" },
        { type: "fill", selector: `[name="candidate_email"]`, value: "jane@example.com" },
        { type: "fill", selector: `[name="candidate_portfolio"]`, value: "https://jane.dev/" },
        { type: "selectOption", selector: `[name="candidate_salary_currency"]`, value: JSON.stringify({ label: "US Dollar ($)" }) },
        { type: "fill", selector: `[name="candidate_salary_amount"]`, value: "85000" },
        { type: "click", selector: `button:has-text("Submit application")` },
      ]),
    );
  });

  it("skips the live Breezy sms consent checkbox when no boolean answer is available", async () => {
    const { page, register, actions } = createLocatorRecorder();
    register(
      `[name="cName"]`,
      `[name="cEmail"]`,
      `[name="cPhoneNumber"]`,
      `[name="smsConsent"]`,
      `[name="cSalary"]`,
      `[name="salaryPeriod"]`,
      `button:has-text("Next")`,
    );

    const result = await fillExternalApplicationPage({
      page: page as never,
      discovery: {
        sourceUrl: "https://udext.breezy.hr/p/9450b95287c4-founding-full-stack-engineer",
        finalUrl: "https://udext.breezy.hr/p/9450b95287c4-founding-full-stack-engineer/apply",
        pageTitle: "Founding Full-Stack Engineer",
        platform: "udext.breezy.hr",
        precursorPage: false,
        precursorSignals: [],
        precursorLinks: [],
        followedPrecursorLink: "https://udext.breezy.hr/p/9450b95287c4-founding-full-stack-engineer/apply",
        fields: [
          {
            key: "cName",
            label: "Full Name *",
            type: "short_text",
            required: true,
            options: [],
            placeholder: "Full Name",
            helpText: null,
            accept: null,
          },
          {
            key: "cEmail",
            label: "Email Address *",
            type: "email",
            required: true,
            options: [],
            placeholder: "Email Address",
            helpText: null,
            accept: null,
          },
          {
            key: "cPhoneNumber",
            label: "Phone Number *",
            type: "short_text",
            required: true,
            options: [],
            placeholder: "Phone Number",
            helpText: null,
            accept: null,
          },
          {
            key: "smsConsent",
            label:
              "By providing your phone number you agree to receive informational text messages from Udext. Udext will send updates about your application via SMS. Message & data rates may apply, reply STOP to opt out at any time.",
            type: "boolean",
            required: false,
            options: [],
            placeholder: null,
            helpText: null,
            accept: null,
          },
          {
            key: "cSalary",
            label: "Desired Salary",
            type: "short_text",
            required: false,
            options: [],
            placeholder: "Desired Salary",
            helpText: null,
            accept: null,
          },
          {
            key: "salaryPeriod",
            label: "Desired Salary",
            type: "single_select",
            required: false,
            options: ["Hourly", "Weekly", "Monthly", "Yearly"],
            placeholder: null,
            helpText: null,
            accept: null,
          },
        ],
      },
      answerPlan: [
        {
          fieldKey: "cName",
          fieldLabel: "Full Name *",
          fieldType: "short_text",
          question: { label: "Full Name *", inputType: "short_text" },
          answer: "Jane Doe",
          source: "candidate-profile",
          confidenceLabel: "high",
        },
        {
          fieldKey: "cEmail",
          fieldLabel: "Email Address *",
          fieldType: "email",
          question: { label: "Email Address *", inputType: "email" },
          answer: "jane@example.com",
          source: "candidate-profile",
          confidenceLabel: "high",
        },
        {
          fieldKey: "cPhoneNumber",
          fieldLabel: "Phone Number *",
          fieldType: "short_text",
          question: { label: "Phone Number *", inputType: "short_text" },
          answer: "+905416467889",
          source: "candidate-profile",
          confidenceLabel: "high",
        },
        {
          fieldKey: "cSalary",
          fieldLabel: "Desired Salary",
          fieldType: "short_text",
          question: { label: "Desired Salary", inputType: "short_text" },
          answer: "1500000",
          source: "candidate-profile",
          confidenceLabel: "high",
        },
      ],
      candidateProfile,
    });

    expect(result.fieldResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldKey: "smsConsent",
          status: "skipped",
          details: "No answer was available for this field.",
        }),
      ]),
    );
    expect(actions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "fill",
          selector: `[name="smsConsent"]`,
        }),
      ]),
    );
    expect(actions).toEqual(
      expect.arrayContaining([
        { type: "fill", selector: `[name="cName"]`, value: "Jane Doe" },
        { type: "fill", selector: `[name="cEmail"]`, value: "jane@example.com" },
        { type: "fill", selector: `[name="cPhoneNumber"]`, value: "+905416467889" },
      ]),
    );
  });

  it("does not fill the live Breezy sms consent checkbox with a phone number", async () => {
    const { page, register, actions } = createLocatorRecorder();
    register(`[name="smsConsent"]`);

    const result = await fillExternalApplicationPage({
      page: page as never,
      discovery: {
        sourceUrl: "https://udext.breezy.hr/p/9450b95287c4-founding-full-stack-engineer",
        finalUrl: "https://udext.breezy.hr/p/9450b95287c4-founding-full-stack-engineer/apply",
        pageTitle: "Founding Full-Stack Engineer",
        platform: "udext.breezy.hr",
        precursorPage: false,
        precursorSignals: [],
        precursorLinks: [],
        followedPrecursorLink: "https://udext.breezy.hr/p/9450b95287c4-founding-full-stack-engineer/apply",
        fields: [
          {
            key: "smsConsent",
            label:
              "By providing your phone number you agree to receive informational text messages from Udext. Udext will send updates about your application via SMS. Message & data rates may apply, reply STOP to opt out at any time.",
            type: "boolean",
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
          fieldKey: "smsConsent",
          fieldLabel: "SMS Consent",
          fieldType: "boolean",
          question: { label: "SMS Consent", inputType: "boolean" },
          answer: "+905416467889",
          source: "candidate-profile",
          confidenceLabel: "high",
        },
      ],
      candidateProfile,
    });

    expect(result.fieldResults[0]).toEqual(
      expect.objectContaining({
        fieldKey: "smsConsent",
        status: "skipped",
        details: "No compatible boolean answer was available for this field.",
      }),
    );
    expect(actions).toEqual([]);
  });

  it("auto-checks a required privacy consent field under the consent policy", async () => {
    const { page, register, actions } = createLocatorRecorder();
    register(`[name="privacyConsent"]`, `button:has-text("Submit application")`);

    const result = await fillExternalApplicationPage({
      page: page as never,
      discovery: {
        sourceUrl: "https://example.com/form",
        finalUrl: "https://example.com/form",
        pageTitle: "Consent form",
        platform: "generic",
        precursorLinks: [],
        followedPrecursorLink: null,
        fields: [
          {
            key: "privacyConsent",
            label: "I agree to the privacy policy",
            type: "boolean",
            semanticKey: "consent.privacy",
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
          fieldKey: "privacyConsent",
          fieldLabel: "I agree to the privacy policy",
          fieldType: "boolean",
          semanticKey: "consent.privacy",
          question: { label: "I agree to the privacy policy", inputType: "boolean" },
          answer: "Yes",
          source: "policy",
          confidenceLabel: "high",
          resolutionStrategy: "semantic:consent.privacy",
        },
      ],
      candidateProfile,
      submit: true,
    });

    expect(result.fieldResults[0]).toEqual(
      expect.objectContaining({
        status: "filled",
        details: "Selected the boolean field.",
      }),
    );
    expect(actions).toEqual(
      expect.arrayContaining([
        { type: "click", selector: `[name="privacyConsent"]` },
        { type: "click", selector: `button:has-text("Submit application")` },
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

  it("returns empty site feedback when the page cannot be evaluated", async () => {
    const resultWithoutEvaluate = await collectExternalSiteFeedback({} as never);
    const resultWithThrowingEvaluate = await collectExternalSiteFeedback({
      evaluate: vi.fn(async () => {
        throw new Error("dom unavailable");
      }),
    } as never);

    expect(resultWithoutEvaluate).toEqual({
      errors: [],
      warnings: [],
      infos: [],
      messages: [],
    });
    expect(resultWithThrowingEvaluate).toEqual({
      errors: [],
      warnings: [],
      infos: [],
      messages: [],
    });
  });

  it("returns unknown when no primary action button is available", async () => {
    const { page } = createLocatorRecorder();
    await expect(getExternalPrimaryAction(page as never)).resolves.toBe("unknown");
    await expect(advanceExternalApplicationPage(page as never, "next")).resolves.toBe(false);
  });

  it("returns false when an explicit submit action cannot be found", async () => {
    const { page } = createLocatorRecorder();
    await expect(advanceExternalApplicationPage(page as never, "submit")).resolves.toBe(false);
  });

  it("leaves a boolean field unselected when the answer is negative", async () => {
    const { page, register, actions } = createLocatorRecorder();
    register(`[id="smsConsent"]`, `button:has-text("Next")`);

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
            key: "smsConsent",
            label: "Receive SMS updates",
            type: "boolean",
            required: false,
            options: ["Yes", "No"],
            placeholder: null,
            helpText: null,
            accept: null,
          },
        ],
      },
      answerPlan: [
        {
          fieldKey: "smsConsent",
          fieldLabel: "Receive SMS updates",
          fieldType: "boolean",
          question: { label: "Receive SMS updates", inputType: "boolean", options: ["Yes", "No"] },
          answer: "No",
          source: "candidate-profile",
          confidenceLabel: "high",
        },
      ],
      candidateProfile,
    });

    expect(result.fieldResults[0]).toEqual(
      expect.objectContaining({
        status: "filled",
        details: "Left the boolean field unselected.",
      }),
    );
    expect(actions).not.toContainEqual(expect.objectContaining({ type: "click", selector: `[id="smsConsent"]` }));
  });

  it("skips a boolean field when the answer is not a compatible boolean", async () => {
    const { page, register } = createLocatorRecorder();
    register(`[id="smsConsent"]`);

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
            key: "smsConsent",
            label: "Receive SMS updates",
            type: "boolean",
            required: false,
            options: ["Yes", "No"],
            placeholder: null,
            helpText: null,
            accept: null,
          },
        ],
      },
      answerPlan: [
        {
          fieldKey: "smsConsent",
          fieldLabel: "Receive SMS updates",
          fieldType: "boolean",
          question: { label: "Receive SMS updates", inputType: "boolean", options: ["Yes", "No"] },
          answer: "Maybe",
          source: "llm",
          confidenceLabel: "medium",
        },
      ],
      candidateProfile,
    });

    expect(result.fieldResults[0]).toEqual(
      expect.objectContaining({
        status: "skipped",
        details: "No compatible boolean answer was available for this field.",
      }),
    );
  });

  it("fails a file field when the referenced resume path does not exist", async () => {
    const { page, register } = createLocatorRecorder();
    register(`input[type="file"]`);

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
            key: "resume",
            label: "Resume",
            type: "file",
            required: true,
            options: [],
            placeholder: null,
            helpText: null,
            accept: ".pdf",
          },
        ],
      },
      answerPlan: [
        {
          fieldKey: "resume",
          fieldLabel: "Resume",
          fieldType: "file",
          question: { label: "Resume", inputType: "file" },
          answer: "C:\\definitely-missing\\resume.pdf",
          source: "candidate-profile",
          confidenceLabel: "high",
        },
      ],
      candidateProfile,
    });

    expect(result.fieldResults[0]).toEqual(
      expect.objectContaining({
        status: "failed",
        details: "File does not exist: C:\\definitely-missing\\resume.pdf",
      }),
    );
  });

  it("falls back to keyboard selection for city autocomplete when no visible option is clickable", async () => {
    const { page, register, actions } = createLocatorRecorder();
    register(`[name="city"]`, `button:has-text("Next")`);

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
            key: "city",
            label: "City of residence",
            type: "short_text",
            semanticKey: "location.city",
            required: true,
            options: [],
            placeholder: "City of residence",
            helpText: null,
            accept: null,
          },
        ],
      },
      answerPlan: [
        {
          fieldKey: "city",
          fieldLabel: "City of residence",
          fieldType: "short_text",
          semanticKey: "location.city",
          question: { label: "City of residence", inputType: "short_text" },
          answer: "Samsun, Turkey",
          source: "candidate-profile",
          confidenceLabel: "high",
        },
      ],
      candidateProfile,
    });

    expect(result.fieldResults[0]).toEqual(expect.objectContaining({ status: "filled" }));
    expect(actions).toEqual(
      expect.arrayContaining([
        { type: "pressSequentially", selector: `[name="city"]`, value: "Samsun, Turkey" },
        { type: "press", selector: `[name="city"]`, value: "ArrowDown" },
        { type: "press", selector: `[name="city"]`, value: "Enter" },
      ]),
    );
  });

  it("advances with submit when explicitly requested and merges pre/post feedback", async () => {
    const { page, register, actions } = createLocatorRecorder();
    register(`[id="name"]`, `button:has-text("Submit")`);
    let evaluateCall = 0;
    page.evaluate = vi.fn(async (callback: unknown) => {
      if (typeof callback === "function") {
        evaluateCall += 1;
        if (evaluateCall === 1) {
          return "form text";
        }
        if (evaluateCall === 2) {
          return [{ severity: "warning", message: "Review before submitting", source: "external.apply" }];
        }
        return [{ severity: "info", message: "Submission staged", source: "external.apply" }];
      }
      return undefined;
    });

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
            key: "name",
            label: "Full name",
            type: "short_text",
            required: true,
            options: [],
            placeholder: "Full name",
            helpText: null,
            accept: null,
          },
        ],
      },
      answerPlan: [
        {
          fieldKey: "name",
          fieldLabel: "Full name",
          fieldType: "short_text",
          question: { label: "Full name", inputType: "short_text" },
          answer: "Jane Doe",
          source: "candidate-profile",
          confidenceLabel: "high",
        },
      ],
      candidateProfile,
      submit: true,
    });

    expect(result.primaryAction).toBe("submit");
    expect(result.advanced).toBe(true);
    expect(result.siteFeedback.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "info",
          message: "Submission staged",
        }),
      ]),
    );
    expect(actions).toContainEqual({ type: "click", selector: `button:has-text("Submit")` });
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

  it("collects native browser validation feedback with the field label", async () => {
    const page = {
      evaluate: vi.fn(async (callback: unknown) => {
        if (typeof callback === "function") {
          return [
            {
              severity: "error",
              message: "Do you require sponsorship for a work visa?: Please fill out this field.",
              source: "external.validation",
            },
          ];
        }
        return [];
      }),
    };

    const result = await collectExternalSiteFeedback(page as never);

    expect(result.errors).toEqual([
      "Do you require sponsorship for a work visa?: Please fill out this field.",
    ]);
    expect(result.messages).toEqual([
      expect.objectContaining({
        severity: "error",
        source: "external.validation",
      }),
    ]);
  });

  it("collects heuristic salary-period feedback from page text", async () => {
    const page = {
      evaluate: vi.fn(async (callback: unknown) => {
        if (typeof callback === "function") {
          return [
            {
              severity: "warning",
              message: "That looks like an annual rate. We are asking for a monthly rate, please.",
              source: "external.heuristic",
            },
          ];
        }
        return [];
      }),
    };

    const result = await collectExternalSiteFeedback(page as never);

    expect(result.warnings).toEqual([
      "That looks like an annual rate. We are asking for a monthly rate, please.",
    ]);
  });

  it("collects decimal and required-field heuristic feedback from page text", async () => {
    const page = {
      evaluate: vi.fn(async (callback: unknown) => {
        if (typeof callback === "function") {
          return [
            {
              severity: "warning",
              message: "Please, do not use decimals.",
              source: "external.heuristic",
            },
            {
              severity: "error",
              message: "Please fill out the following information.",
              source: "external.heuristic",
            },
          ];
        }
        return [];
      }),
    };

    const result = await collectExternalSiteFeedback(page as never);

    expect(result.warnings).toEqual(["Please, do not use decimals."]);
    expect(result.errors).toEqual(["Please fill out the following information."]);
    expect(result.messages).toEqual([
      expect.objectContaining({ severity: "warning", source: "external.heuristic" }),
      expect.objectContaining({ severity: "error", source: "external.heuristic" }),
    ]);
  });

  it("collects informational notice feedback without promoting it to warnings or errors", async () => {
    const page = {
      evaluate: vi.fn(async (callback: unknown) => {
        if (typeof callback === "function") {
          return [
            {
              severity: "info",
              message: "Application progress saved.",
              source: "external.apply",
            },
          ];
        }
        return [];
      }),
    };

    const result = await collectExternalSiteFeedback(page as never);

    expect(result.infos).toEqual(["Application progress saved."]);
    expect(result.warnings).toEqual([]);
    expect(result.errors).toEqual([]);
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

  it("returns unknown when no primary action button is present", async () => {
    const empty = createLocatorRecorder();
    await expect(getExternalPrimaryAction(empty.page as never)).resolves.toBe("unknown");
  });

  it("clicks the submit button when asked to advance explicitly", async () => {
    const { page, register, actions } = createLocatorRecorder();
    register(`button:has-text("Submit")`);

    await expect(advanceExternalApplicationPage(page as never, "submit")).resolves.toBe(true);
    expect(actions).toContainEqual({ type: "click", selector: `button:has-text("Submit")` });
  });

  it("detects localized and broader external primary actions", async () => {
    const next = createLocatorRecorder();
    next.register(`button:has-text("Verder")`);
    await expect(getExternalPrimaryAction(next.page as never)).resolves.toBe("next");

    const submit = createLocatorRecorder();
    submit.register(`button:has-text("Apply now")`);
    await expect(getExternalPrimaryAction(submit.page as never)).resolves.toBe("submit");
  });

  it("returns false when an explicit advance action has no matching button", async () => {
    const empty = createLocatorRecorder();
    await expect(advanceExternalApplicationPage(empty.page as never, "next")).resolves.toBe(false);
  });

  it("uploads the resume through the live Breezy custom file chooser button", async () => {
    const actions: Array<{ type: string; selector: string; value?: string }> = [];
    const setFiles = vi.fn(async () => undefined);
    let evaluatePass = 0;
    const page = {
      async evaluate(callback: unknown) {
        if (typeof callback === "function") {
          evaluatePass += 1;
          return evaluatePass === 1 ? "" : [];
        }
        return undefined;
      },
      waitForEvent: vi.fn(async (event: string) => {
        if (event !== "filechooser") {
          throw new Error(`Unexpected event: ${event}`);
        }
        return { setFiles };
      }),
      locator(selector: string) {
        return {
          first() {
            return this;
          },
          async count() {
            return selector === `.file-input-container .button.resume` ? 1 : 0;
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
            throw new Error("Not a native file input");
          },
        };
      },
      waitForTimeout: vi.fn(async () => undefined),
    };

    const result = await fillExternalApplicationPage({
      page: page as never,
      discovery: {
        sourceUrl: "https://udext.breezy.hr/p/9450b95287c4-founding-full-stack-engineer",
        finalUrl: "https://udext.breezy.hr/p/9450b95287c4-founding-full-stack-engineer",
        pageTitle: "Founding Full-Stack Engineer",
        platform: "udext.breezy.hr",
        precursorLinks: [],
        followedPrecursorLink: null,
        precursorPage: false,
        precursorSignals: [],
        fields: [
          {
            key: "custom-file-upload-1",
            label: "Upload Resume*",
            type: "file",
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
          fieldKey: "custom-file-upload-1",
          fieldLabel: "Upload Resume*",
          fieldType: "file",
          question: { label: "Upload Resume*", inputType: "file" },
          answer: "C:\\Users\\numan\\OneDrive\\Desktop\\Job Tool\\user\\resume.pdf",
          source: "candidate-profile",
          confidenceLabel: "high",
        },
      ],
      candidateProfile,
    });

    expect(result.fieldResults[0]).toEqual(
      expect.objectContaining({
        status: "filled",
        details: "Selected file for upload.",
      }),
    );
    expect(actions).toContainEqual({
      type: "click",
      selector: `.file-input-container .button.resume`,
    });
    expect(setFiles).toHaveBeenCalledWith(
      "C:\\Users\\numan\\OneDrive\\Desktop\\Job Tool\\user\\resume.pdf",
    );
  });

  it("fails clearly when both native upload and custom file chooser fallback fail", async () => {
    let evaluatePass = 0;
    const page = {
      async evaluate(callback: unknown) {
        if (typeof callback === "function") {
          evaluatePass += 1;
          return evaluatePass === 1 ? "" : [];
        }
        return undefined;
      },
      waitForEvent: vi.fn(async () => {
        throw new Error("file chooser unavailable");
      }),
      locator(selector: string) {
        return {
          first() {
            return this;
          },
          async count() {
            return selector === `.file-input-container .button.resume` ? 1 : 0;
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
            throw new Error("Not a native file input");
          },
        };
      },
      waitForTimeout: vi.fn(async () => undefined),
    };

    const result = await fillExternalApplicationPage({
      page: page as never,
      discovery: {
        sourceUrl: "https://udext.breezy.hr/p/9450b95287c4-founding-full-stack-engineer",
        finalUrl: "https://udext.breezy.hr/p/9450b95287c4-founding-full-stack-engineer",
        pageTitle: "Founding Full-Stack Engineer",
        platform: "udext.breezy.hr",
        precursorLinks: [],
        followedPrecursorLink: null,
        precursorPage: false,
        precursorSignals: [],
        fields: [
          {
            key: "custom-file-upload-1",
            label: "Upload Resume*",
            type: "file",
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
          fieldKey: "custom-file-upload-1",
          fieldLabel: "Upload Resume*",
          fieldType: "file",
          question: { label: "Upload Resume*", inputType: "file" },
          answer: "C:\\Users\\numan\\OneDrive\\Desktop\\Job Tool\\user\\resume.pdf",
          source: "candidate-profile",
          confidenceLabel: "high",
        },
      ],
      candidateProfile,
    });

    expect(result.fieldResults[0]).toEqual(
      expect.objectContaining({
        status: "failed",
        details: "Could not upload the file using either a file input or file chooser.",
      }),
    );
    expect(result.blockingRequiredFields).toEqual(["Upload Resume*"]);
  });
});
