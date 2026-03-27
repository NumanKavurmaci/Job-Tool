import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "@playwright/test";

export interface PageArtifactResult {
  screenshotPath?: string;
  htmlPath?: string;
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function getArtifactsDir(): string {
  return join(process.cwd(), "artifacts");
}

export async function capturePageArtifacts(
  page: Pick<Page, "screenshot" | "content">,
  label: string,
): Promise<PageArtifactResult> {
  const baseDir = join(getArtifactsDir(), "screenshots");
  await mkdir(baseDir, { recursive: true });

  const baseName = `${timestamp()}-${sanitizeSegment(label)}`;
  const screenshotPath = join(baseDir, `${baseName}.png`);
  const htmlPath = join(baseDir, `${baseName}.html`);
  const result: PageArtifactResult = {};

  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
    result.screenshotPath = screenshotPath;
  } catch {
    // Ignore artifact capture failures so they never mask the original error.
  }

  try {
    const html = await page.content();
    await writeFile(htmlPath, html, "utf8");
    result.htmlPath = htmlPath;
  } catch {
    // Ignore artifact capture failures so they never mask the original error.
  }

  return result;
}
