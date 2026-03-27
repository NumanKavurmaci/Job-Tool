import type { Page } from "@playwright/test";
import { resolveAdapter } from "../adapters/resolveAdapter.js";
import type { ExtractedJobContent } from "../adapters/types.js";

export async function extractJobText(
  page: Page,
  url: string,
): Promise<ExtractedJobContent> {
  const adapter = resolveAdapter(url);
  return adapter.extract(page, url);
}
