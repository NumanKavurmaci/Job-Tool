import { chromium, type Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("../../src/answers/resolveAnswer.js", () => ({
  resolveAnswer: vi.fn(async ({ question }: { question: { label: string } }) => ({
    questionType: "general_short_text",
    strategy: "deterministic",
    answer: question.label.includes("salary") ? "1500000" : "Yes",
    confidence: 0.9,
    confidenceLabel: "high",
    source: "candidate-profile",
  })),
}));
import { resolveAnswer } from "../../src/answers/resolveAnswer.js";
import {
  discoverExternalApplication,
  extractExternalPageText,
  followExternalApplicationLink,
  inspectExternalApplicationPage,
  planExternalApplicationAnswers,
} from "../../src/external/discovery.js";
import {
  breezyPersonalDetailsFormHtml,
  breezyResumeButtonsHtml,
  greenhousePrecursorPageHtml,
  leverPrecursorPageHtml,
  workableSingleStepFormHtml,
  workdayPrecursorPageHtml,
} from "../fixtures/external.js";

const mockedResolveAnswer = vi.mocked(resolveAnswer);
let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser.close();
});

function buildCandidateProfile(overrides: Partial<Parameters<typeof planExternalApplicationAnswers>[0]["candidateProfile"]> = {}) {
  return {
    fullName: "Jane Doe",
    email: "jane@example.com",
    phone: null,
    location: null,
    linkedinUrl: null,
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
    salaryExpectations: {
      usd: null,
      eur: null,
      try: "1500000",
    },
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
    sourceMetadata: {
      resumePath: "./user/resume.pdf",
    },
    ...overrides,
  };
}

describe("external application discovery", () => {
  it("infers multiple generic platforms and field types from discovered pages", async () => {
    const goto = vi.fn();
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce({
        url: "https://jobs.ashbyhq.com/example/apply",
        title: "Ashby form",
        fields: [
          {
            key: "email",
            label: "Email",
            inputType: "email",
            required: true,
            options: [],
            placeholder: "name@example.com",
            helpText: null,
            accept: null,
          },
          {
            key: "portfolio",
            label: "Portfolio",
            inputType: "url",
            required: false,
            options: [],
            placeholder: null,
            helpText: null,
            accept: null,
          },
          {
            key: "stage",
            label: "Available to start part-time?",
            inputType: "checkbox",
            required: false,
            options: ["Yes", "No", "Maybe"],
            placeholder: null,
            helpText: null,
            accept: null,
          },
        ],
        precursorLinks: [],
      })
      .mockResolvedValueOnce({
        url: "https://company.workdayjobs.com/careers/job/123",
        title: "Workday apply",
        fields: [
          {
            key: "phone",
            label: "Phone",
            inputType: "tel",
            required: true,
            options: [],
            placeholder: null,
            helpText: null,
            accept: null,
          },
          {
            key: "cover_letter",
            label: "Cover Letter",
            inputType: "textarea",
            required: false,
            options: [],
            placeholder: null,
            helpText: "Optional",
            accept: null,
          },
          {
            key: "country",
            label: "Country",
            inputType: "select",
            required: true,
            options: ["Turkey", "Germany", "Netherlands"],
            placeholder: null,
            helpText: null,
            accept: null,
          },
        ],
        precursorLinks: [],
      })
      .mockResolvedValueOnce({
        url: "https://example.org/apply",
        title: "Generic apply",
        fields: [
          {
            key: "freeform",
            label: "Why do you want to join?",
            inputType: "text",
            required: false,
            options: [],
            placeholder: "Tell us more",
            helpText: null,
            accept: null,
          },
          {
            key: "availability",
            label: "Available immediately?",
            inputType: "radio",
            required: true,
            options: ["Yes", "No"],
            placeholder: null,
            helpText: null,
            accept: null,
          },
        ],
        precursorLinks: [],
      });

    const ashbyResult = await discoverExternalApplication({ goto, evaluate } as never, "https://jobs.ashbyhq.com/example/apply");
    const workdayResult = await discoverExternalApplication({ goto, evaluate } as never, "https://company.workdayjobs.com/careers/job/123");
    const genericResult = await discoverExternalApplication({ goto, evaluate } as never, "https://example.org/apply");

    expect(ashbyResult.platform).toBe("ashby");
    expect(ashbyResult.fields.map((field) => field.type)).toEqual(["email", "url", "multi_select"]);

    expect(workdayResult.platform).toBe("workday");
    expect(workdayResult.fields.map((field) => field.type)).toEqual(["phone", "long_text", "single_select"]);

    expect(genericResult.platform).toBe("example.org");
    expect(genericResult.fields.map((field) => field.type)).toEqual(["short_text", "boolean"]);
  });

  it("maps generic DOM inspection output into normalized external fields", async () => {
    const goto = vi.fn();
    const evaluate = vi.fn().mockResolvedValue({
      url: "https://tally.so/r/31yWVM",
      title: "Backend Engineer Job application",
      fields: [
        {
          key: "field_ai",
          label: "Do you use AI to help you with coding?",
          inputType: "radio",
          required: true,
          options: ["Yes", "No"],
          placeholder: null,
          helpText: null,
          accept: null,
        },
        {
          key: "field_resume",
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
    });

    const result = await discoverExternalApplication(
      { goto, evaluate } as never,
      "https://tally.so/r/31yWVM",
    );

    expect(goto).toHaveBeenCalledWith("https://tally.so/r/31yWVM");
    expect(result.platform).toBe("tally");
    expect(result.fields).toEqual([
      expect.objectContaining({
        key: "field_ai",
        type: "boolean",
        options: ["Yes", "No"],
      }),
      expect.objectContaining({
        key: "field_resume",
        type: "file",
        accept: ".pdf",
      }),
    ]);
  });

  it("treats select-style controls without enumerated options as selectable fields", async () => {
    const goto = vi.fn();
    const evaluate = vi.fn().mockResolvedValue({
      url: "https://tally.so/r/31yWVM",
      title: "Backend Engineer Job application",
      fields: [
        {
          key: "dropdown_1",
          label: "Do you use AI to help you with coding?",
          inputType: "select",
          required: true,
          options: [],
          placeholder: null,
          helpText: null,
          accept: null,
        },
      ],
      precursorLinks: [],
    });

    const result = await discoverExternalApplication(
      { goto, evaluate } as never,
      "https://tally.so/r/31yWVM",
    );

    expect(result.fields).toEqual([
      expect.objectContaining({
        key: "dropdown_1",
        type: "single_select",
      }),
    ]);
  });

  it("follows a discovered precursor link and marks it on the result", async () => {
    const goto = vi.fn();
    const evaluate = vi.fn().mockResolvedValueOnce({
      url: "https://example.com/form",
      title: "Application form",
      fields: [],
      precursorLinks: [],
    });

    const result = await followExternalApplicationLink(
      { goto, evaluate } as never,
      "https://example.com/start",
      "https://example.com/form",
    );

    expect(goto).toHaveBeenCalledWith("https://example.com/form");
    expect(result.followedPrecursorLink).toBe("https://example.com/form");
    expect(result.finalUrl).toBe("https://example.com/form");
  });

  it("waits for late-rendered external apply CTA content before inspecting the page", async () => {
    const goto = vi.fn();
    const waitForFunction = vi.fn().mockResolvedValue(undefined);
    const evaluate = vi.fn().mockResolvedValue({
      url: "https://apply.workable.com/j/64A61ED04E",
      title: "Constructor job",
      fields: [],
      precursorLinks: [
        {
          label: "Apply for this job",
          href: "https://apply.workable.com/constructor-1/j/64A61ED04E/apply/",
        },
      ],
    });

    const result = await discoverExternalApplication(
      { goto, waitForFunction, evaluate } as never,
      "https://apply.workable.com/j/64A61ED04E",
    );

    expect(waitForFunction).toHaveBeenCalledTimes(1);
    expect(result.precursorLinks).toEqual([
      {
        label: "Apply for this job",
        href: "https://apply.workable.com/constructor-1/j/64A61ED04E/apply/",
      },
    ]);
  });

  it("retries inspection when the first pass sees an empty pre-apply page", async () => {
    const goto = vi.fn();
    const waitForFunction = vi.fn().mockResolvedValue(undefined);
    const waitForTimeout = vi.fn().mockResolvedValue(undefined);
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce({
        url: "https://apply.workable.com/constructor-1/j/64A61ED04E",
        title: "Constructor job",
        fields: [],
        precursorLinks: [],
      })
      .mockResolvedValueOnce({
        url: "https://apply.workable.com/constructor-1/j/64A61ED04E/",
        title: "Constructor job",
        fields: [],
        precursorLinks: [
          {
            label: "Apply for this job",
            href: "https://apply.workable.com/constructor-1/j/64A61ED04E/apply/",
          },
        ],
      });

    const result = await discoverExternalApplication(
      { goto, waitForFunction, waitForTimeout, evaluate } as never,
      "https://apply.workable.com/j/64A61ED04E",
    );

    expect(waitForTimeout).toHaveBeenCalledWith(500);
    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(result.precursorLinks).toEqual([
      {
        label: "Apply for this job",
        href: "https://apply.workable.com/constructor-1/j/64A61ED04E/apply/",
      },
    ]);
  });

  it("returns the initial empty inspection when no retry timer is available", async () => {
    const goto = vi.fn();
    const evaluate = vi.fn().mockResolvedValue({
      url: "notaurl",
      title: "Static shell",
      fields: [],
      precursorLinks: [],
    });

    const result = await discoverExternalApplication(
      { goto, evaluate } as never,
      "notaurl",
    );

    expect(result.platform).toBe("generic");
    expect(result.fields).toEqual([]);
    expect(result.precursorLinks).toEqual([]);
  });

  it("keeps the final empty inspection after exhausting retry delays", async () => {
    const goto = vi.fn();
    const waitForFunction = vi.fn().mockResolvedValue(undefined);
    const waitForTimeout = vi.fn().mockResolvedValue(undefined);
    const evaluate = vi.fn().mockResolvedValue({
      url: "https://example.com/apply",
      title: "Loading shell",
      fields: [],
      precursorLinks: [],
    });

    const result = await discoverExternalApplication(
      { goto, waitForFunction, waitForTimeout, evaluate } as never,
      "https://example.com/apply",
    );

    expect(waitForTimeout).toHaveBeenCalledTimes(2);
    expect(waitForTimeout).toHaveBeenNthCalledWith(1, 500);
    expect(waitForTimeout).toHaveBeenNthCalledWith(2, 1000);
    expect(evaluate).toHaveBeenCalledTimes(3);
    expect(result.fields).toEqual([]);
    expect(result.precursorLinks).toEqual([]);
  });

  it("detects the Lever precursor apply CTA from the Commencis-style landing page", async () => {
    const page = await browser.newPage();
    await page.route("https://jobs.lever.co/commencis/a3be10ef-53ab-4842-b114-ae9f60b43e99", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: leverPrecursorPageHtml,
      });
    });

    const result = await discoverExternalApplication(
      page,
      "https://jobs.lever.co/commencis/a3be10ef-53ab-4842-b114-ae9f60b43e99",
    );

    expect(result.platform).toBe("lever");
    expect(result.fields).toEqual([]);
    expect(result.precursorLinks).toContainEqual({
      label: "apply for this job",
      href: "https://jobs.lever.co/commencis/a3be10ef-53ab-4842-b114-ae9f60b43e99/apply",
    });

    await page.close();
  });

  it("keeps the explicit Lever apply CTA when inspecting the precursor page directly", async () => {
    const page = await browser.newPage();
    await page.setContent(leverPrecursorPageHtml);

    const result = await inspectExternalApplicationPage(
      page,
      "https://jobs.lever.co/commencis/a3be10ef-53ab-4842-b114-ae9f60b43e99",
    );

    expect(result.fields).toEqual([]);
    expect(result.precursorLinks[0]).toEqual({
      label: "apply for this job",
      href: "https://jobs.lever.co/commencis/a3be10ef-53ab-4842-b114-ae9f60b43e99/apply",
    });

    await page.close();
  });

  it("detects a Greenhouse bridge page as a precursor page with an apply CTA", async () => {
    const page = await browser.newPage();
    await page.setContent(greenhousePrecursorPageHtml);

    const result = await inspectExternalApplicationPage(
      page,
      "https://boards.greenhouse.io/example/jobs/1234567",
    );

    expect(result.precursorPage).toBe(true);
    expect(result.precursorLinks).toContainEqual({
      label: "Apply for this job",
      href: "https://boards.greenhouse.io/example/jobs/1234567/apply",
    });

    await page.close();
  });

  it("detects a Workday intermediate page as a precursor page with a continue CTA", async () => {
    const page = await browser.newPage();
    await page.setContent(workdayPrecursorPageHtml);

    const result = await inspectExternalApplicationPage(
      page,
      "https://example.wd1.myworkdayjobs.com/en-US/Careers/job/Istanbul",
    );

    expect(result.precursorPage).toBe(true);
    expect(result.precursorLinks).toContainEqual({
      label: "Continue to application",
      href: "https://example.wd1.myworkdayjobs.com/en-US/Careers/job/Istanbul/apply",
    });

    await page.close();
  });

  it("extracts clean labels from the live Breezy personal details form", async () => {
    const page = await browser.newPage();
    await page.route(
      "https://udext.breezy.hr/p/9450b95287c4-founding-full-stack-engineer/apply",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: breezyPersonalDetailsFormHtml,
        });
      },
    );
    await page.goto(
      "https://udext.breezy.hr/p/9450b95287c4-founding-full-stack-engineer/apply",
    );
    await page.evaluate(() => {
      document.title = "Founding Full-Stack Engineer";
    });

    const result = await inspectExternalApplicationPage(
      page,
      "https://udext.breezy.hr/p/9450b95287c4-founding-full-stack-engineer",
    );

    const byKey = Object.fromEntries(result.fields.map((field) => [field.key, field]));

    expect(byKey.cName).toEqual(
      expect.objectContaining({
        label: "Full Name*",
        type: "short_text",
      }),
    );
    expect(byKey.cEmail).toEqual(
      expect.objectContaining({
        label: "Email Address*",
        type: "email",
      }),
    );
    expect(byKey.cPhoneNumber).toEqual(
      expect.objectContaining({
        label: "Phone Number*",
        type: "short_text",
      }),
    );
    expect(byKey.smsConsent).toEqual(
      expect.objectContaining({
        type: "boolean",
        semanticKey: "consent.sms",
        semanticConfidence: "high",
      }),
    );
    expect(byKey.smsConsent?.label).toContain("By providing your phone number");
    expect(byKey.smsConsent?.label).not.toContain("A phone number is required");
    expect(byKey.smsConsent?.semanticSignals).toEqual(
      expect.arrayContaining(["text:sms", "text:sms-copy", "type:boolean"]),
    );
    expect(byKey.cSalary).toEqual(
      expect.objectContaining({
        label: "Desired Salary",
        semanticKey: "salary.amount",
      }),
    );
    expect(byKey.salaryCurrency).toEqual(
      expect.objectContaining({
        label: "Desired Salary",
        type: "single_select",
        semanticKey: "salary.currency",
      }),
    );
    expect(byKey.salaryPeriod).toEqual(
      expect.objectContaining({
        label: "Desired Salary",
        type: "single_select",
        semanticKey: "salary.period",
      }),
    );

    await page.close();
  });

  it("detects the live Breezy upload resume button as a file field", async () => {
    const page = await browser.newPage();
    await page.route(
      "https://udext.breezy.hr/p/9450b95287c4-founding-full-stack-engineer",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: breezyResumeButtonsHtml,
        });
      },
    );
    await page.goto(
      "https://udext.breezy.hr/p/9450b95287c4-founding-full-stack-engineer",
    );

    const result = await inspectExternalApplicationPage(
      page,
      "https://udext.breezy.hr/p/9450b95287c4-founding-full-stack-engineer",
    );

    expect(result.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "file",
          label: "Upload Resume *",
          required: true,
          semanticKey: "resume.upload",
        }),
      ]),
    );

    await page.close();
  });

  it("discovers a single-step workable-style form with semantic portfolio, salary, resume and privacy fields", async () => {
    const page = await browser.newPage();
    await page.route("https://example.com/workable-single-step", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: workableSingleStepFormHtml,
      });
    });
    await page.goto("https://example.com/workable-single-step");

    const result = await inspectExternalApplicationPage(
      page,
      "https://example.com/workable-single-step",
    );

    const byKey = Object.fromEntries(result.fields.map((field) => [field.key, field]));
    expect(result.fields).toHaveLength(7);
    expect(byKey.candidate_portfolio).toEqual(
      expect.objectContaining({
        semanticKey: "profile.portfolio",
      }),
    );
    expect(byKey.candidate_salary_currency).toEqual(
      expect.objectContaining({
        type: "single_select",
        semanticKey: "salary.currency",
      }),
    );
    expect(byKey.candidate_salary_amount).toEqual(
      expect.objectContaining({
        type: "number",
        semanticKey: "salary.amount",
      }),
    );
    expect(byKey.candidate_resume).toEqual(
      expect.objectContaining({
        type: "file",
        semanticKey: "resume.upload",
      }),
    );
    expect(byKey.candidate_privacy).toEqual(
      expect.objectContaining({
        type: "boolean",
        semanticKey: "consent.privacy",
      }),
    );

    await page.close();
  });

  it("extracts cleaned page text and falls back to empty string on evaluation failure", async () => {
    const cleaned = await extractExternalPageText({
      evaluate: vi.fn().mockResolvedValue("Hello world from form"),
    } as never);
    const fallback = await extractExternalPageText({
      evaluate: vi.fn().mockRejectedValue(new Error("cannot read body")),
    } as never);

    expect(cleaned).toBe("Hello world from form");
    expect(fallback).toBe("");
  });

  it("builds an answer plan using the shared answer resolver and resume path for file fields", async () => {
    mockedResolveAnswer.mockImplementation(async ({ question }: { question: { label: string } }) => ({
      questionType: "general_short_text",
      strategy: "deterministic",
      answer: question.label.includes("salary") ? "1500000" : "Yes",
      confidence: 0.9,
      confidenceLabel: "high",
      source: "candidate-profile",
    }));

    const result = await planExternalApplicationAnswers({
      fields: [
        {
          key: "salary",
          label: "What is your salary expectation (TRY)?",
          type: "number",
          required: true,
          options: [],
          placeholder: null,
          helpText: null,
          accept: null,
        },
        {
          key: "resume",
          label: "Upload your resume (only pdf)",
          type: "file",
          required: true,
          options: [],
          placeholder: null,
          helpText: null,
          accept: ".pdf",
        },
      ],
      candidateProfile: buildCandidateProfile(),
      pageContext: {
        title: "Backend Engineer Job application",
        text: "Required tech stack: Node.js, TypeScript, RESTful API, AWS, MongoDB.",
        sourceUrl: "https://tally.so/r/31yWVM",
      },
    });

    expect(result).toEqual([
      expect.objectContaining({
        fieldKey: "salary",
        answer: expect.any(String),
      }),
      expect.objectContaining({
        fieldKey: "resume",
        answer: "./user/resume.pdf",
        source: "candidate-profile",
      }),
    ]);
    expect(mockedResolveAnswer).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        pageContext: expect.objectContaining({
          title: "Backend Engineer Job application",
          sourceUrl: "https://tally.so/r/31yWVM",
        }),
      }),
    );
  });

  it("plans semantic salary answers for the live Breezy desired salary widget", async () => {
    const result = await planExternalApplicationAnswers({
      fields: [
        {
          key: "salaryCurrency",
          label: "Desired Salary",
          type: "single_select",
          semanticKey: "salary.currency",
          required: false,
          options: ["US Dollar ($)", "Euro (€)", "Turkish Lira (TL)"],
          placeholder: null,
          helpText: null,
          accept: null,
        },
        {
          key: "cSalary",
          label: "Desired Salary",
          type: "short_text",
          semanticKey: "salary.amount",
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
          semanticKey: "salary.period",
          required: false,
          options: ["Hourly", "Weekly", "Monthly", "Yearly"],
          placeholder: null,
          helpText: null,
          accept: null,
        },
      ],
      candidateProfile: buildCandidateProfile(),
      pageContext: {
        title: "Founding Full-Stack Engineer",
        text: "Desired Salary",
        sourceUrl: "https://udext.breezy.hr/p/9450b95287c4-founding-full-stack-engineer/apply",
      },
    });

    expect(result).toEqual([
      expect.objectContaining({
        fieldKey: "salaryCurrency",
        answer: "Turkish Lira (TL)",
        source: "candidate-profile",
        semanticKey: "salary.currency",
        resolutionStrategy: "semantic:salary-currency",
      }),
      expect.objectContaining({
        fieldKey: "cSalary",
        answer: "1500000",
        source: "candidate-profile",
        semanticKey: "salary.amount",
        resolutionStrategy: "semantic:salary-amount",
      }),
      expect.objectContaining({
        fieldKey: "salaryPeriod",
        answer: "Yearly",
        source: "candidate-profile",
        semanticKey: "salary.period",
        resolutionStrategy: "semantic:salary-period",
      }),
    ]);
  });

  it("matches broader semantic answers to descriptive option labels and profile data", async () => {
    const result = await planExternalApplicationAnswers({
      fields: [
        {
          key: "workAuth",
          label: "What is your work authorization status?",
          type: "single_select",
          semanticKey: "work.authorization",
          required: true,
          options: [
            "I am authorized to work here without sponsorship",
            "I require sponsorship now or in the future",
          ],
          placeholder: null,
          helpText: null,
          accept: null,
        },
        {
          key: "visa",
          label: "Will you require sponsorship now or in the future?",
          type: "single_select",
          semanticKey: "sponsorship.required",
          required: true,
          options: ["Yes", "No"],
          placeholder: null,
          helpText: null,
          accept: null,
        },
        {
          key: "relocation",
          label: "Are you willing to relocate?",
          type: "single_select",
          semanticKey: "relocation.willing",
          required: false,
          options: ["Yes", "No"],
          placeholder: null,
          helpText: null,
          accept: null,
        },
        {
          key: "city",
          label: "City of residence",
          type: "short_text",
          semanticKey: "location.city",
          required: true,
          options: [],
          placeholder: null,
          helpText: null,
          accept: null,
        },
        {
          key: "phone",
          label: "Phone number",
          type: "phone",
          semanticKey: "phone.number",
          required: true,
          options: [],
          placeholder: null,
          helpText: null,
          accept: null,
        },
        {
          key: "linkedin",
          label: "LinkedIn Profile",
          type: "url",
          semanticKey: "profile.linkedin",
          required: false,
          options: [],
          placeholder: null,
          helpText: null,
          accept: null,
        },
        {
          key: "countryCode",
          label: "countryCode",
          type: "single_select",
          semanticKey: "phone.country_code",
          required: false,
          options: [],
          placeholder: null,
          helpText: null,
          accept: null,
        },
        {
          key: "github",
          label: "GitHub URL",
          type: "url",
          semanticKey: "profile.github",
          required: false,
          options: [],
          placeholder: null,
          helpText: null,
          accept: null,
        },
        {
          key: "portfolio",
          label: "Portfolio Website",
          type: "url",
          semanticKey: "profile.portfolio",
          required: false,
          options: [],
          placeholder: null,
          helpText: null,
          accept: null,
        },
        {
          key: "yoe",
          label: "Years of experience",
          type: "short_text",
          semanticKey: "experience.years",
          required: false,
          options: [],
          placeholder: null,
          helpText: null,
          accept: null,
        },
      ],
      candidateProfile: buildCandidateProfile({
        location: "Samsun, Türkiye",
        phone: "+905416467889",
        workAuthorization: "Authorized to work in Turkey without sponsorship",
        requiresSponsorship: false,
        regionalAuthorization: {
          defaultRequiresSponsorship: true,
          turkeyRequiresSponsorship: false,
          europeRequiresSponsorship: true,
        },
        willingToRelocate: true,
        linkedinUrl: "https://linkedin.com/in/jane",
        githubUrl: "https://github.com/jane",
        portfolioUrl: "https://jane.dev",
        yearsOfExperienceTotal: 4,
      }),
      pageContext: {
        title: "Founding Full-Stack Engineer",
        text: "Authorization and sponsorship questions. Phone number * + 1",
        sourceUrl: "https://example.com/apply",
      },
    });

    expect(result).toEqual([
      expect.objectContaining({
        fieldKey: "workAuth",
        answer: "I am authorized to work here without sponsorship",
        resolutionStrategy: "semantic:option-match:work-authorization",
      }),
      expect.objectContaining({
        fieldKey: "visa",
        answer: "Yes",
        resolutionStrategy: "semantic:option-match:sponsorship",
      }),
      expect.objectContaining({
        fieldKey: "relocation",
        answer: "Yes",
        resolutionStrategy: "semantic:option-match:relocation",
      }),
      expect.objectContaining({
        fieldKey: "city",
        answer: "Samsun, Turkey",
        resolutionStrategy: "semantic:location-city",
      }),
      expect.objectContaining({
        fieldKey: "phone",
        answer: "5416467889",
        resolutionStrategy: "semantic:phone-local",
      }),
      expect.objectContaining({
        fieldKey: "linkedin",
        answer: "https://linkedin.com/in/jane",
        resolutionStrategy: "semantic:profile-linkedin",
      }),
      expect.objectContaining({
        fieldKey: "countryCode",
        answer: "Turkey (+90)",
        resolutionStrategy: "semantic:phone-country-code",
      }),
      expect.objectContaining({
        fieldKey: "github",
        answer: "https://github.com/jane",
        resolutionStrategy: "semantic:profile-github",
      }),
      expect.objectContaining({
        fieldKey: "portfolio",
        answer: "https://jane.dev",
        resolutionStrategy: "semantic:profile-portfolio",
      }),
      expect.objectContaining({
        fieldKey: "yoe",
        answer: "4",
        resolutionStrategy: "semantic:experience-years",
      }),
    ]);
  });

  it("classifies sponsorship follow-up details as free-text details instead of a boolean requirement", async () => {
    const result = await planExternalApplicationAnswers({
      fields: [
        {
          key: "sponsorWorkVisaDetails",
          label: "Please provide more details so we can support you:",
          type: "long_text",
          semanticKey: "sponsorship.details",
          required: true,
          options: [],
          placeholder: null,
          helpText: null,
          accept: null,
        },
      ],
      candidateProfile: buildCandidateProfile({
        regionalAuthorization: {
          defaultRequiresSponsorship: true,
          turkeyRequiresSponsorship: false,
          europeRequiresSponsorship: true,
        },
      }),
      pageContext: {
        title: "Senior Fullstack Javascript",
        text: "Please provide more details so we can support you with sponsorship.",
        sourceUrl: "https://lumenalta.com/jobs/senior-fullstack-javascript/apply",
      },
    });

    expect(result).toEqual([
      expect.objectContaining({
        fieldKey: "sponsorWorkVisaDetails",
        answer:
          "I am based in Turkey and do not require sponsorship for roles in Turkey, but I would require visa sponsorship for roles based in Europe.",
        resolutionStrategy: "semantic:sponsorship-details",
      }),
    ]);
  });

  it("normalizes annual salary expectations to a monthly USD amount when the field asks for a monthly rate", async () => {
    const result = await planExternalApplicationAnswers({
      fields: [
        {
          key: "salary",
          label: "Desired rate per month (USD)",
          type: "number",
          semanticKey: "salary.amount",
          required: true,
          options: [],
          placeholder: "e.g. 3000",
          helpText: null,
          accept: null,
        },
      ],
      candidateProfile: buildCandidateProfile({
        salaryExpectations: {
          usd: "80000",
          eur: null,
          try: null,
        },
      }),
      pageContext: {
        title: "Javascript Fullstack Engineer - Senior",
        text: "Desired rate per month (USD)",
        sourceUrl: "https://lumenalta.com/jobs/senior-fullstack-javascript/apply",
      },
    });

    expect(result).toEqual([
      expect.objectContaining({
        fieldKey: "salary",
        answer: "6667",
        resolutionStrategy: "semantic:salary-amount",
        notes: "Resolved from candidate salary expectations and normalized to a monthly amount.",
      }),
    ]);
  });

  it("rounds years of experience to a whole number for integer-only fields", async () => {
    const result = await planExternalApplicationAnswers({
      fields: [
        {
          key: "declaredYoE",
          label: "Years of experience",
          type: "number",
          semanticKey: "experience.years",
          required: true,
          options: [],
          placeholder: "e.g. 8",
          helpText: null,
          accept: null,
        },
      ],
      candidateProfile: buildCandidateProfile({
        yearsOfExperienceTotal: 2.75,
      }),
      pageContext: {
        title: "Application",
        text: "Please, do not use decimals.",
        sourceUrl: "https://example.com/apply",
      },
    });

    expect(result).toEqual([
      expect.objectContaining({
        fieldKey: "declaredYoE",
        answer: "3",
        resolutionStrategy: "semantic:experience-years",
        notes: "Resolved from candidate years-of-experience total and normalized to a whole number.",
      }),
    ]);
  });

  it("drops generic companion fields when a react-select style field already represents the same question", async () => {
    const goto = vi.fn();
    const evaluate = vi.fn().mockResolvedValue({
      url: "https://example.com/react-select",
      title: "React select application",
      fields: [
        {
          key: "react-select-1-input",
          label: "sponsorWorkVisa",
          inputType: "text",
          required: false,
          options: [],
          placeholder: null,
          helpText: null,
          accept: null,
          selectorHints: ['[id="react-select-1-input"]'],
        },
        {
          key: "sponsorWorkVisa",
          label: "Please fill out the following information.",
          inputType: "text",
          required: true,
          options: [],
          placeholder: null,
          helpText: null,
          accept: null,
          selectorHints: ['[name="sponsorWorkVisa"]'],
        },
      ],
      precursorLinks: [],
    });

    const result = await discoverExternalApplication(
      { goto, evaluate } as never,
      "https://example.com/react-select",
    );

    expect(result.fields).toHaveLength(1);
    expect(result.fields[0]).toEqual(
      expect.objectContaining({
        key: "react-select-1-input",
        label: "sponsorWorkVisa",
        semanticKey: "sponsorship.required",
        type: "single_select",
      }),
    );
  });

  it("keeps consent and cover letter fields in manual review while still tagging their semantics", async () => {
    const result = await planExternalApplicationAnswers({
      fields: [
        {
          key: "smsConsent",
          label: "Receive SMS application updates",
          type: "boolean",
          semanticKey: "consent.sms",
          required: false,
          options: ["Yes", "No"],
          placeholder: null,
          helpText: null,
          accept: null,
        },
        {
          key: "privacyConsent",
          label: "I agree to the privacy policy",
          type: "boolean",
          semanticKey: "consent.privacy",
          required: true,
          options: ["Yes", "No"],
          placeholder: null,
          helpText: null,
          accept: null,
        },
        {
          key: "coverLetter",
          label: "Cover Letter",
          type: "long_text",
          semanticKey: "cover_letter.text",
          required: false,
          options: [],
          placeholder: null,
          helpText: null,
          accept: null,
        },
      ],
      candidateProfile: buildCandidateProfile(),
      pageContext: {
        title: "External apply",
        text: "Consent and cover letter",
        sourceUrl: "https://example.com/apply",
      },
    });

    expect(result).toEqual([
      expect.objectContaining({
        fieldKey: "smsConsent",
        answer: null,
        source: "manual",
        resolutionStrategy: "semantic:consent.sms",
      }),
      expect.objectContaining({
        fieldKey: "privacyConsent",
        answer: null,
        source: "manual",
        resolutionStrategy: "semantic:consent.privacy",
      }),
      expect.objectContaining({
        fieldKey: "coverLetter",
        answer: null,
        source: "manual",
        resolutionStrategy: "semantic:cover_letter.text",
      }),
    ]);
  });

  it("normalizes boolean, array and missing resume answers for external planning", async () => {
    mockedResolveAnswer
      .mockResolvedValueOnce({
        questionType: "boolean",
        strategy: "deterministic",
        answer: true,
        confidence: 0.8,
        confidenceLabel: "medium",
        source: "generated-answer",
        notes: ["Inferred from profile"],
      } as never)
      .mockResolvedValueOnce({
        questionType: "multi_select",
        strategy: "deterministic",
        answer: ["React", "TypeScript"],
        confidence: 0.8,
        confidenceLabel: "medium",
        source: "generated-answer",
        notes: ["Matched overlapping skills", "Likely good fit"],
      } as never)
      .mockResolvedValueOnce({
        questionType: "general_short_text",
        strategy: "manual-review",
        answer: null,
        confidence: 0.2,
        confidenceLabel: "manual_review",
        source: "manual",
      } as never);

    const result = await planExternalApplicationAnswers({
      fields: [
        {
          key: "ai_usage",
          label: "Do you use AI tools while coding?",
          type: "boolean",
          required: true,
          options: ["Yes", "No"],
          placeholder: null,
          helpText: null,
          accept: null,
        },
        {
          key: "stack",
          label: "Which technologies do you use?",
          type: "multi_select",
          required: false,
          options: ["React", "TypeScript", "Python"],
          placeholder: null,
          helpText: null,
          accept: null,
        },
        {
          key: "motivation",
          label: "Why this role?",
          type: "long_text",
          required: false,
          options: [],
          placeholder: null,
          helpText: null,
          accept: null,
        },
        {
          key: "resume",
          label: "Resume upload",
          type: "file",
          required: true,
          options: [],
          placeholder: null,
          helpText: null,
          accept: ".pdf",
        },
      ],
      candidateProfile: buildCandidateProfile({
        sourceMetadata: {
          resumePath: null,
        },
      }),
      pageContext: {
        title: "Backend Engineer Job application",
        text: "Required tech stack: Node.js, TypeScript, RESTful API, AWS, MongoDB. Cover Letter.",
        sourceUrl: "https://tally.so/r/31yWVM",
      },
    });

    expect(result).toEqual([
      expect.objectContaining({
        fieldKey: "ai_usage",
        answer: "Yes",
        notes: "Inferred from profile",
      }),
      expect.objectContaining({
        fieldKey: "stack",
        answer: "React, TypeScript",
        notes: "Matched overlapping skills Likely good fit",
      }),
      expect.objectContaining({
        fieldKey: "motivation",
        answer: null,
        source: "manual",
      }),
      expect.objectContaining({
        fieldKey: "resume",
        answer: null,
        confidenceLabel: "manual_review",
      }),
    ]);
  });

  it("skips synthetic trap-like field labels such as input-6 and input-8", async () => {
    mockedResolveAnswer.mockClear();

    const result = await planExternalApplicationAnswers({
      fields: [
        {
          key: "field_1",
          label: "input-6",
          type: "short_text",
          required: false,
          options: [],
          placeholder: null,
          helpText: null,
          accept: null,
        },
        {
          key: "field_2",
          label: "input-8",
          type: "short_text",
          required: false,
          options: [],
          placeholder: null,
          helpText: null,
          accept: null,
        },
        {
          key: "field_3",
          label: "Email",
          type: "email",
          required: false,
          options: [],
          placeholder: "Email",
          helpText: null,
          accept: null,
        },
      ],
      candidateProfile: buildCandidateProfile(),
      pageContext: {
        title: "External apply",
        text: "Email",
        sourceUrl: "https://example.com/apply",
      },
    });

    expect(result).toEqual([
      expect.objectContaining({
        fieldKey: "field_1",
        answer: null,
        source: "manual",
        confidenceLabel: "manual_review",
        notes: "Skipped because the field label looks synthetic or trap-like.",
      }),
      expect.objectContaining({
        fieldKey: "field_2",
        answer: null,
        source: "manual",
        confidenceLabel: "manual_review",
        notes: "Skipped because the field label looks synthetic or trap-like.",
      }),
      expect.objectContaining({
        fieldKey: "field_3",
        answer: "Yes",
      }),
    ]);
    expect(mockedResolveAnswer).toHaveBeenCalledTimes(1);
  });
});
