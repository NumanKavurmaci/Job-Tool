import { beforeEach, describe, expect, it, vi } from "vitest";

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
      candidateProfile: {
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
        sourceMetadata: {},
      },
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
});
