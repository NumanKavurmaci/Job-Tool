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
});
