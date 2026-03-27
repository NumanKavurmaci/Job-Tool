import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractResumeText } from "../../src/candidate/resume/extractResumeText.js";

describe("default resume fixture", () => {
  it("extracts text from the default root CV pdf", async () => {
    const resumePath = path.join(process.cwd(), "Numan Kavurmacı March 2026 CV Resume.pdf");
    const text = await extractResumeText(resumePath);

    expect(text).toContain("Numan Kavurmacı");
    expect(text).toContain("Software Engineer");
    expect(text.toLowerCase()).toContain("linkedin");
    expect(text.length).toBeGreaterThan(3000);
  });
});
