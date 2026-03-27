import { readFile } from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

export async function extractResumeText(resumePath: string): Promise<string> {
  const extension = path.extname(resumePath).toLowerCase();

  if (extension === ".txt" || extension === ".md") {
    return (await readFile(resumePath, "utf8")).trim();
  }

  if (extension === ".pdf") {
    const buffer = await readFile(resumePath);
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    await parser.destroy();
    return result.text.trim();
  }

  if (extension === ".docx") {
    const buffer = await readFile(resumePath);
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  }

  throw new Error(`Unsupported resume format: ${extension || "unknown"}`);
}
