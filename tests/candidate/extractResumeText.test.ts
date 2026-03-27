import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getTextMock = vi.fn();
const destroyMock = vi.fn();
const extractRawTextMock = vi.fn();
const PDFParseMock = vi.fn(function PDFParseMock(this: object) {
  return {
    getText: getTextMock,
    destroy: destroyMock,
  };
});

vi.mock("pdf-parse", () => ({
  PDFParse: PDFParseMock,
}));

vi.mock("mammoth", () => ({
  default: {
    extractRawText: extractRawTextMock,
  },
}));

describe("extractResumeText", () => {
  beforeEach(() => {
    vi.resetModules();
    getTextMock.mockReset();
    destroyMock.mockReset();
    extractRawTextMock.mockReset();
  });

  it("extracts plain text from txt files", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "resume-text-"));
    const filePath = path.join(dir, "resume.txt");
    await writeFile(filePath, "Jane Doe\nBackend Engineer", "utf8");

    const { extractResumeText } = await import("../../src/candidate/resume/extractResumeText.js");
    await expect(extractResumeText(filePath)).resolves.toContain("Jane Doe");
  });

  it("extracts plain text from markdown files", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "resume-md-"));
    const filePath = path.join(dir, "resume.md");
    await writeFile(filePath, "# Jane Doe\n\nBackend Engineer", "utf8");

    const { extractResumeText } = await import("../../src/candidate/resume/extractResumeText.js");
    await expect(extractResumeText(filePath)).resolves.toContain("Backend Engineer");
  });

  it("extracts text from pdf files", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "resume-pdf-"));
    const filePath = path.join(dir, "resume.pdf");
    await writeFile(filePath, "fake-pdf", "utf8");
    getTextMock.mockResolvedValue({ text: "PDF resume text" });
    destroyMock.mockResolvedValue(undefined);

    const { extractResumeText } = await import("../../src/candidate/resume/extractResumeText.js");
    await expect(extractResumeText(filePath)).resolves.toBe("PDF resume text");
    expect(destroyMock).toHaveBeenCalled();
  });

  it("extracts text from docx files", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "resume-docx-"));
    const filePath = path.join(dir, "resume.docx");
    await writeFile(filePath, "fake-docx", "utf8");
    extractRawTextMock.mockResolvedValue({ value: "DOCX resume text" });

    const { extractResumeText } = await import("../../src/candidate/resume/extractResumeText.js");
    await expect(extractResumeText(filePath)).resolves.toBe("DOCX resume text");
  });

  it("rejects unsupported formats", async () => {
    const { extractResumeText } = await import("../../src/candidate/resume/extractResumeText.js");
    await expect(extractResumeText("resume.csv")).rejects.toThrow("Unsupported resume format");
  });
});
