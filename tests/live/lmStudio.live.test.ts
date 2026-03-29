import { beforeEach, describe, expect, it, vi } from "vitest";

const TALLY_PHASE_ONE_DOCUMENT = `<main class="tally-page tally-page-1">
<form>
<progress max="2" value="1">Page 1 of 2</progress>
<h1>Backend Engineer Job application</h1>
<div>LET'S MAKE A GOOD JOB TOGETHER. We are looking for a backend engineer. Required tech stack: Node.js, TypeScript, RESTful API, Git, AWS, MongoDB. Work remotely.</div>
<h2>Tell us a bit more about yourself</h2>
<input type="text" placeholder="First Name" aria-label="First Name" />
<input type="text" placeholder="Last Name" aria-label="Last Name" />
<input type="email" placeholder="Email" aria-label="Email" />
<input type="tel" placeholder="Phone" aria-label="Phone" />
<input type="url" placeholder="LinkedIN Profile" aria-label="LinkedIN Profile" />
<h3>Do you use AI to help you with coding?</h3>
<input type="text" aria-label="Do you use AI to help you with coding?" />
<h3>How many years of experience do you have with NestJS?</h3>
<input type="text" aria-label="How many years of experience do you have with NestJS?" />
<h3>How about working part-time first so we can get to know each other before you start full-time?</h3>
<input type="text" aria-label="How about working part-time first so we can get to know each other before you start full-time?" />
<h3>What is your salary expectation (TRY)?</h3>
<input type="text" aria-label="What is your salary expectation (TRY)?" />
<h3>Cover Letter</h3>
<textarea aria-label="Cover Letter"></textarea>
<h3>Upload your resume (only pdf)</h3>
<input accept="application/pdf,.pdf" type="file" aria-label="Upload your resume (only pdf)" />
<button type="submit">Next</button>
</form>
</main>`;

const TALLY_PHASE_TWO_DOCUMENT = `<section class="tally-page tally-page-2">
<button>Back</button>
<form>
<progress max="2" value="2">Page 2 of 2</progress>
<h3>Thank you for applying! We'll be in touch shortly.</h3>
<button type="submit">Submit</button>
</form>
</section>`;

const TALLY_PHASE_THREE_DOCUMENT = `<div class="thank-you-page">
<svg aria-hidden="true"></svg>
<h1>Thanks for completing this form!</h1>
</div>`;

function buildCandidateProfile() {
  return {
    fullName: "Jane Doe",
    email: "jane@example.com",
    phone: "123",
    location: "Berlin",
    linkedinUrl: "https://linkedin.com/in/jane",
    githubUrl: null,
    portfolioUrl: null,
    summary: "Backend engineer focused on TypeScript and Node.js.",
    gpa: null,
    yearsOfExperienceTotal: 4,
    currentTitle: "Backend Engineer",
    preferredRoles: ["Backend Engineer"],
    preferredTechStack: ["TypeScript", "Node.js", "React"],
    skills: ["TypeScript", "Node.js", "React"],
    languages: ["English"],
    salaryExpectations: { usd: null, eur: null, try: null },
    salaryExpectation: null,
    experienceOverrides: {},
    workAuthorization: "authorized",
    requiresSponsorship: false,
    willingToRelocate: false,
    remotePreference: "remote",
    remoteOnly: true,
    disability: {
      hasVisualDisability: false,
      disabilityPercentage: null,
      requiresAccommodation: null,
      accommodationNotes: null,
      disclosurePreference: "manual-review",
    },
    education: [],
    experience: [
      {
        company: "Acme",
        title: "Backend Engineer",
        summary: "Built TypeScript APIs and React dashboards",
        technologies: ["TypeScript", "Node.js", "React"],
        startDate: null,
        endDate: null,
      },
    ],
    projects: [],
    resumeText: "resume text",
    sourceMetadata: {
      resumePath: "./user/resume.pdf",
    },
  };
}

function createExternalFlowPage(args: {
  goto?: ReturnType<typeof vi.fn>;
  evaluate: ReturnType<typeof vi.fn>;
  visibleSelectors?: string[];
}) {
  const visibleSelectors = new Set(args.visibleSelectors ?? []);
  const goto = args.goto ?? vi.fn();

  return {
    goto,
    evaluate: args.evaluate,
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

async function classifyExternalDocumentStage(documentText: string) {
  const { completePrompt } = await import("../../src/llm/completePrompt.js");

  const result = await completePrompt([
    "You are classifying the current state of an external job application flow.",
    "Return exactly one token from this list and nothing else:",
    "FORM_STEP",
    "FINAL_SUBMIT_STEP",
    "COMPLETED",
    "",
    "Rules:",
    "- If the page shows input fields, textarea fields, dropdown fields, or file upload fields that still need to be filled, answer FORM_STEP.",
    "- If the main action button says Next, answer FORM_STEP.",
    "- If the main action button says Submit and the page is still inside a form, answer FINAL_SUBMIT_STEP.",
    "- A page with a Next button and unanswered fields is still FORM_STEP, not FINAL_SUBMIT_STEP.",
    "- Answer COMPLETED only when the form is already over and there is no active form submit step left.",
    "",
    "Document:",
    documentText,
  ].join("\n"));

  return result.text.trim();
}

describe("LM Studio live integration", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.LLM_PROVIDER = "local";
    process.env.LOCAL_LLM_BASE_URL = "http://127.0.0.1:1234/v1";
    process.env.LOCAL_LLM_MODEL = "openai/gpt-oss-20b";
    process.env.DATABASE_URL = "file:./dev.db";
  });

  it("reaches the live LM Studio endpoint", async () => {
    const response = await fetch("http://127.0.0.1:1234/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        temperature: 0,
        messages: [
          {
            role: "user",
            content: "Reply with exactly: OK",
          },
        ],
      }),
    });

    expect(response.ok).toBe(true);

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };

    expect(data.choices?.[0]?.message?.content).toContain("OK");
  });

  it("parses a job through the real local provider pipeline", async () => {
    const { parseJob } = await import("../../src/llm/parseJob.js");
    const result = await parseJob([
      "Title: Backend Engineer",
      "Company: Acme",
      "Location: Remote",
      "",
      "Description:",
      "Build TypeScript APIs.",
      "",
      "Requirements:",
      "TypeScript, Node.js, 3 years experience.",
      "",
      "Benefits:",
      "Remote work.",
    ].join("\n"));

    expect(result.provider).toBe("local");
    expect(result.model).toBe("openai/gpt-oss-20b");
    expect(result.parsed.title).toBeTruthy();
  });

  it("parses a resume through the real local provider pipeline", async () => {
    const { parseResume } = await import("../../src/candidate/resume/parseResume.js");
    const result = await parseResume([
      "Jane Doe",
      "jane@example.com",
      "Backend Engineer",
      "Skills: TypeScript, Node.js, React",
      "Experience:",
      "Backend Engineer at Acme - Built TypeScript APIs and React dashboards",
      "Education:",
      "BSc in Computer Science",
    ].join("\n"));

    expect(result.fullName).toBeTruthy();
    expect(Array.isArray(result.skills)).toBe(true);
  }, 20000);

  it("generates a short answer through the real local provider path", async () => {
    const { generateShortAnswer } = await import("../../src/materials/generateShortAnswer.js");
    const result = await generateShortAnswer({
      question: "Why are you interested in this role?",
      candidateProfile: buildCandidateProfile(),
      targetJobContext: {
        title: "Backend Engineer",
        company: "Acme",
        location: "Remote",
      },
      maxCharacters: 220,
    });

    expect(result.text.length).toBeGreaterThan(0);
    expect(result.text.length).toBeLessThanOrEqual(220);
  }, 20000);

  it("generates a cover letter from visible external page context through the real local provider path", async () => {
    const { generateCoverLetter } = await import("../../src/materials/generateCoverLetter.js");
    const result = await generateCoverLetter({
      candidateProfile: buildCandidateProfile(),
      targetJobContext: {
        title: "Backend Engineer",
        company: "Beta Limited",
        location: "Remote",
      },
      pageContextText: TALLY_PHASE_ONE_DOCUMENT,
      maxCharacters: 1200,
    });

    expect(result.text.length).toBeGreaterThan(80);
    expect(result.text.length).toBeLessThanOrEqual(1200);
    expect(/backend|node|typescript|api/i.test(result.text)).toBe(true);
  }, 20000);

  it("resolves a fallback application answer through the real local provider path", async () => {
    const { resolveAiFallbackAnswer } = await import(
      "../../src/questions/strategies/aiFallback.js"
    );

    const result = await resolveAiFallbackAnswer({
      question: {
        label: "How many years of experience do you have with C++?",
        inputType: "text",
      },
      classified: {
        type: "years_of_experience",
        normalizedText: "how many years of experience do you have with c++",
        confidence: 0.4,
      },
      candidateProfile: buildCandidateProfile(),
      previousAttempt: {
        questionType: "years_of_experience",
        strategy: "needs-review",
        answer: null,
        confidence: 0,
        confidenceLabel: "manual_review",
        source: "manual",
      },
    });

    expect(result.strategy).toBe("generated");
    expect(result.source).toBe("llm");
    expect(result.answer === "0" || result.answer === 0 || result.answer === null || typeof result.answer === "string").toBe(true);
  }, 20000);

  it("uses the real local provider to recommend following a precursor link in external apply discovery", async () => {
    const { runExternalApplyDryRunFlow } = await import("../../src/app/flows/externalApplyFlows.js");
    const { completePrompt } = await import("../../src/llm/completePrompt.js");

    const goto = vi.fn();
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce({
        url: "https://example.com/start",
        title: "Application landing",
        fields: [],
        precursorLinks: [
          { label: "Start application", href: "https://example.com/form" },
        ],
      })
      .mockResolvedValueOnce(
        "This page only introduces the role and includes a single Start application link to reach the actual form.",
      )
      .mockResolvedValueOnce({
        url: "https://example.com/form",
        title: "Actual form",
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
      .mockResolvedValueOnce("This is the actual application form.");

    const result = await runExternalApplyDryRunFlow(
      {
        mode: "external-apply-dry-run",
        url: "https://example.com/start",
        resumePath: "./user/resume.pdf",
      },
      {
        loadCandidateMasterProfile: vi.fn().mockResolvedValue(buildCandidateProfile()),
        withPage: vi.fn(async (fn: (page: unknown) => Promise<unknown>) =>
          fn(
            createExternalFlowPage({
              goto,
              evaluate,
              visibleSelectors: [`[id="salary"]`],
            }),
          )),
        completePrompt,
        writeRunReport: vi.fn().mockResolvedValue("artifacts/external-apply-runs/report.json"),
        logger: {
          info: vi.fn(),
        },
      } as never,
    );

    expect(result.discovery.followedPrecursorLink).toBe("https://example.com/form");
    expect(result.recommendedAction).toBe("follow");
    expect(result.aiAdvisory?.text).toMatch(/FOLLOW:/i);
  }, 20000);

  it("uses the real local provider to keep the bot on page when the page already looks like the right step", async () => {
    const { runExternalApplyDryRunFlow } = await import("../../src/app/flows/externalApplyFlows.js");
    const { completePrompt } = await import("../../src/llm/completePrompt.js");

    const goto = vi.fn();
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce({
        url: "https://example.com/current-step",
        title: "Application overview",
        fields: [],
        precursorLinks: [
          { label: "Learn more", href: "https://example.com/about" },
        ],
      })
      .mockResolvedValueOnce(
        "You are already on the right application step. The only visible link is Learn more, which is informational and should not be followed.",
      )
      .mockResolvedValueOnce(
        "You are already on the right application step. The only visible link is Learn more, which is informational and should not be followed.",
      );

    const result = await runExternalApplyDryRunFlow(
      {
        mode: "external-apply-dry-run",
        url: "https://example.com/current-step",
        resumePath: "./user/resume.pdf",
      },
      {
        loadCandidateMasterProfile: vi.fn().mockResolvedValue(buildCandidateProfile()),
        withPage: vi.fn(async (fn: (page: unknown) => Promise<unknown>) =>
          fn(
            createExternalFlowPage({
              goto,
              evaluate,
            }),
          )),
        completePrompt,
        writeRunReport: vi.fn().mockResolvedValue("artifacts/external-apply-runs/report.json"),
        logger: {
          info: vi.fn(),
        },
      } as never,
    );

    expect(result.recommendedAction).toBe("stay");
    expect(result.discovery.followedPrecursorLink).toBeNull();
    expect(result.aiAdvisory?.text.trim()).toBe("STAY");
    expect(goto).toHaveBeenCalledTimes(1);
  }, 20000);

  it("classifies the provided first-stage external application document as a fillable form step", async () => {
    const stage = await classifyExternalDocumentStage(TALLY_PHASE_ONE_DOCUMENT);
    expect(stage).toBe("FORM_STEP");
  }, 20000);

  it("classifies the provided second-stage external application document as the final submit step", async () => {
    const stage = await classifyExternalDocumentStage(TALLY_PHASE_TWO_DOCUMENT);
    expect(stage).toBe("FINAL_SUBMIT_STEP");
  }, 20000);

  it("classifies the provided third-stage external application document as completed", async () => {
    const stage = await classifyExternalDocumentStage(TALLY_PHASE_THREE_DOCUMENT);
    expect(stage).toBe("COMPLETED");
  }, 20000);
});
