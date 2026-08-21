import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractResumeText } from "../../src/candidate/resume/extractResumeText.js";

describe("default resume fixture", () => {
  const resumePath = path.join(process.cwd(), "user", "resume.pdf");

  it.skipIf(!existsSync(resumePath))("extracts text from the optional local user resume pdf", async () => {
    const text = await extractResumeText(resumePath);

    expect(text).toContain("Software Engineer");
    expect(text.toLowerCase()).toContain("linkedin");
    expect(text.length).toBeGreaterThan(3000);
  });
});
