import { beforeEach, describe, expect, it, vi } from "vitest";

const completePromptMock = vi.fn();

vi.mock("../../src/llm/completePrompt.js", () => ({
  completePrompt: completePromptMock,
}));

describe("repairAnswerFromSiteFeedback", () => {
  beforeEach(() => {
    completePromptMock.mockReset();
  });

  it("repairs a numeric answer using site validation feedback", async () => {
    completePromptMock.mockResolvedValue({
      text: JSON.stringify({
        answer: "85000",
        confidence: 0.82,
        notes: ["Returned a numeric salary value."],
      }),
    });

    const { repairAnswerFromSiteFeedback } = await import(
      "../../src/questions/strategies/aiCorrection.js"
    );

    const result = await repairAnswerFromSiteFeedback({
      question: {
        label: "Net ücret beklentiniz nedir?",
        inputType: "text",
        helpText: null,
        placeholder: null,
      },
      candidateProfile: {
        fullName: "Jane Doe",
        location: "Berlin",
        currentTitle: "Backend Engineer",
        yearsOfExperienceTotal: 4,
        skills: ["TypeScript", "Node.js"],
        languages: ["English"],
        linkedinUrl: "https://linkedin.com/in/jane",
        portfolioUrl: null,
        gpa: null,
        salaryExpectations: { usd: "85000", eur: null, try: null },
        resumeText: "Backend engineer with TypeScript experience.",
      } as any,
      previousAnswer: {
        questionType: "salary",
        strategy: "generated",
        answer: "negotiable",
        confidence: 0.6,
        confidenceLabel: "medium",
        source: "llm",
      },
      validationFeedback: "0.0 değerinden büyük bir decimal sayısı girin",
    });

    expect(result.answer).toBe("85000");
    expect(result.source).toBe("llm");
    expect(result.notes?.join(" ")).toContain("site feedback");
    expect(String(completePromptMock.mock.calls[0][0])).toContain("0.0 değerinden büyük bir decimal sayısı girin");
    expect(String(completePromptMock.mock.calls[0][0])).toContain("negotiable");
  });

  it("maps corrected select answers back to an exact option", async () => {
    completePromptMock.mockResolvedValue({
      text: JSON.stringify({
        answer: "full time",
        confidence: 0.7,
      }),
    });

    const { repairAnswerFromSiteFeedback } = await import(
      "../../src/questions/strategies/aiCorrection.js"
    );

    const result = await repairAnswerFromSiteFeedback({
      question: {
        label: "Employment type",
        inputType: "select",
        options: ["Full-time", "Contract"],
      },
      candidateProfile: {
        fullName: "Jane Doe",
        location: "Berlin",
        currentTitle: "Backend Engineer",
        yearsOfExperienceTotal: 4,
        skills: ["TypeScript"],
        languages: ["English"],
        linkedinUrl: null,
        portfolioUrl: null,
        gpa: null,
        salaryExpectations: { usd: null, eur: null, try: null },
        resumeText: "Backend engineer.",
      } as any,
      previousAnswer: {
        questionType: "general_short_text",
        strategy: "generated",
        answer: "full time role",
        confidence: 0.6,
        confidenceLabel: "medium",
        source: "llm",
      },
      validationFeedback: "Please choose one of the listed options.",
    });

    expect(result.answer).toBe("Full-time");
  });

  it("normalizes checkbox-like corrections to booleans", async () => {
    completePromptMock.mockResolvedValue({
      text: JSON.stringify({
        answer: "yes",
        confidence: 0.61,
      }),
    });

    const { repairAnswerFromSiteFeedback } = await import(
      "../../src/questions/strategies/aiCorrection.js"
    );

    const result = await repairAnswerFromSiteFeedback({
      question: {
        label: "Do you require sponsorship?",
        inputType: "checkbox",
      },
      candidateProfile: {
        fullName: "Jane Doe",
        location: "Berlin",
        currentTitle: "Backend Engineer",
        yearsOfExperienceTotal: 4,
        skills: ["TypeScript"],
        languages: ["English"],
        linkedinUrl: null,
        portfolioUrl: null,
        gpa: null,
        salaryExpectations: { usd: null, eur: null, try: null },
        resumeText: "Backend engineer.",
      } as any,
      previousAnswer: {
        questionType: "sponsorship",
        strategy: "generated",
        answer: "maybe",
        confidence: 0.5,
        confidenceLabel: "medium",
        source: "llm",
      },
      validationFeedback: "Please provide a yes or no value.",
    });

    expect(result.answer).toBe(true);
  });

  it("keeps null when the model cannot safely repair the answer", async () => {
    completePromptMock.mockResolvedValue({
      text: JSON.stringify({
        answer: null,
        confidence: 0.34,
      }),
    });

    const { repairAnswerFromSiteFeedback } = await import(
      "../../src/questions/strategies/aiCorrection.js"
    );

    const result = await repairAnswerFromSiteFeedback({
      question: {
        label: "Expected salary",
        inputType: "text",
      },
      candidateProfile: {
        fullName: "Jane Doe",
        location: "Berlin",
        currentTitle: "Backend Engineer",
        yearsOfExperienceTotal: 4,
        skills: ["TypeScript"],
        languages: ["English"],
        linkedinUrl: null,
        portfolioUrl: null,
        gpa: null,
        salaryExpectations: { usd: null, eur: null, try: null },
        resumeText: "Backend engineer.",
      } as any,
      previousAnswer: {
        questionType: "salary",
        strategy: "generated",
        answer: "negotiable",
        confidence: 0.5,
        confidenceLabel: "medium",
        source: "llm",
      },
      validationFeedback: "Please enter a number.",
    });

    expect(result.answer).toBeNull();
    expect(result.confidence).toBeGreaterThanOrEqual(0.3);
  });

  it("clamps low confidence values to the minimum repair confidence", async () => {
    completePromptMock.mockResolvedValue({
      text: JSON.stringify({
        answer: "50000",
        confidence: 0.01,
      }),
    });

    const { repairAnswerFromSiteFeedback } = await import(
      "../../src/questions/strategies/aiCorrection.js"
    );

    const result = await repairAnswerFromSiteFeedback({
      question: {
        label: "Expected salary",
        inputType: "text",
      },
      candidateProfile: {
        fullName: "Jane Doe",
        location: "Berlin",
        currentTitle: "Backend Engineer",
        yearsOfExperienceTotal: 4,
        skills: ["TypeScript"],
        languages: ["English"],
        linkedinUrl: null,
        portfolioUrl: null,
        gpa: null,
        salaryExpectations: { usd: "50000", eur: null, try: null },
        resumeText: "Backend engineer.",
      } as any,
      previousAnswer: {
        questionType: "salary",
        strategy: "generated",
        answer: "open",
        confidence: 0.5,
        confidenceLabel: "medium",
        source: "llm",
      },
      validationFeedback: "Please enter a number.",
    });

    expect(result.confidence).toBe(0.3);
    expect(result.confidenceLabel).toBe("low");
  });

  it("clamps high confidence values to the maximum repair confidence", async () => {
    completePromptMock.mockResolvedValue({
      text: JSON.stringify({
        answer: "50000",
        confidence: 0.99,
      }),
    });

    const { repairAnswerFromSiteFeedback } = await import(
      "../../src/questions/strategies/aiCorrection.js"
    );

    const result = await repairAnswerFromSiteFeedback({
      question: {
        label: "Expected salary",
        inputType: "text",
      },
      candidateProfile: {
        fullName: "Jane Doe",
        location: "Berlin",
        currentTitle: "Backend Engineer",
        yearsOfExperienceTotal: 4,
        skills: ["TypeScript"],
        languages: ["English"],
        linkedinUrl: null,
        portfolioUrl: null,
        gpa: null,
        salaryExpectations: { usd: "50000", eur: null, try: null },
        resumeText: "Backend engineer.",
      } as any,
      previousAnswer: {
        questionType: "salary",
        strategy: "generated",
        answer: "open",
        confidence: 0.5,
        confidenceLabel: "medium",
        source: "llm",
      },
      validationFeedback: "Please enter a number.",
    });

    expect(result.confidence).toBe(0.85);
    expect(result.confidenceLabel).toBe("high");
  });

  it("uses the default repair confidence when the model omits confidence", async () => {
    completePromptMock.mockResolvedValue({
      text: JSON.stringify({
        answer: "50000",
      }),
    });

    const { repairAnswerFromSiteFeedback } = await import(
      "../../src/questions/strategies/aiCorrection.js"
    );

    const result = await repairAnswerFromSiteFeedback({
      question: {
        label: "Expected salary",
        inputType: "text",
      },
      candidateProfile: {
        fullName: "Jane Doe",
        location: "Berlin",
        currentTitle: "Backend Engineer",
        yearsOfExperienceTotal: 4,
        skills: ["TypeScript"],
        languages: ["English"],
        linkedinUrl: null,
        portfolioUrl: null,
        gpa: null,
        salaryExpectations: { usd: "50000", eur: null, try: null },
        resumeText: "Backend engineer.",
      } as any,
      previousAnswer: {
        questionType: "salary",
        strategy: "generated",
        answer: "open",
        confidence: 0.5,
        confidenceLabel: "medium",
        source: "llm",
      },
      validationFeedback: "Please enter a number.",
    });

    expect(result.confidence).toBe(0.66);
  });

  it("preserves previous notes and appends repair notes", async () => {
    completePromptMock.mockResolvedValue({
      text: JSON.stringify({
        answer: "85000",
        notes: ["Changed to a plain numeric string."],
      }),
    });

    const { repairAnswerFromSiteFeedback } = await import(
      "../../src/questions/strategies/aiCorrection.js"
    );

    const result = await repairAnswerFromSiteFeedback({
      question: {
        label: "Expected salary",
        inputType: "text",
      },
      candidateProfile: {
        fullName: "Jane Doe",
        location: "Berlin",
        currentTitle: "Backend Engineer",
        yearsOfExperienceTotal: 4,
        skills: ["TypeScript"],
        languages: ["English"],
        linkedinUrl: null,
        portfolioUrl: null,
        gpa: null,
        salaryExpectations: { usd: "85000", eur: null, try: null },
        resumeText: "Backend engineer.",
      } as any,
      previousAnswer: {
        questionType: "salary",
        strategy: "generated",
        answer: "open",
        confidence: 0.5,
        confidenceLabel: "medium",
        source: "llm",
        notes: ["Original answer came from generic AI fallback."],
      },
      validationFeedback: "Please enter a number.",
    });

    expect(result.notes).toEqual(
      expect.arrayContaining([
        "Original answer came from generic AI fallback.",
        "Answer was repaired using site feedback from the application form.",
        "Changed to a plain numeric string.",
      ]),
    );
  });

  it("includes page context and options in the repair prompt", async () => {
    completePromptMock.mockResolvedValue({
      text: JSON.stringify({
        answer: "Contract",
      }),
    });

    const { repairAnswerFromSiteFeedback } = await import(
      "../../src/questions/strategies/aiCorrection.js"
    );

    await repairAnswerFromSiteFeedback({
      question: {
        label: "Employment type",
        inputType: "select",
        options: ["Full-time", "Contract"],
        helpText: "Choose one option",
        placeholder: "Select",
      },
      candidateProfile: {
        fullName: "Jane Doe",
        location: "Berlin",
        currentTitle: "Backend Engineer",
        yearsOfExperienceTotal: 4,
        skills: ["TypeScript"],
        languages: ["English"],
        linkedinUrl: null,
        portfolioUrl: null,
        gpa: null,
        salaryExpectations: { usd: null, eur: null, try: null },
        resumeText: "Backend engineer.",
      } as any,
      previousAnswer: {
        questionType: "general_short_text",
        strategy: "generated",
        answer: "full time role",
        confidence: 0.6,
        confidenceLabel: "medium",
        source: "llm",
      },
      validationFeedback: "Please choose one of the listed options.",
      pageContext: {
        title: "Application",
        sourceUrl: "https://example.com/apply",
        text: "The form asks for employment type and start date.",
      },
    });

    const prompt = String(completePromptMock.mock.calls[0][0]);
    expect(prompt).toContain("Please choose one of the listed options.");
    expect(prompt).toContain("Full-time | Contract");
    expect(prompt).toContain("Application");
    expect(prompt).toContain("https://example.com/apply");
    expect(prompt).toContain("The form asks for employment type and start date.");
  });
});
