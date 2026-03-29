import { describe, expect, it, vi } from "vitest";
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
  planExternalApplicationAnswers,
} from "../../src/external/discovery.js";

const mockedResolveAnswer = vi.mocked(resolveAnswer);

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
