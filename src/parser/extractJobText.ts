import type { Page } from "@playwright/test";
import { resolveAdapter } from "../adapters/resolveAdapter.js";
import type {
  ExtractedJobContent,
  JobExtractionOptions,
} from "../adapters/types.js";

export async function extractJobText(
  page: Page,
  url: string,
  options?: JobExtractionOptions,
): Promise<ExtractedJobContent> {
  const adapter = resolveAdapter(url);
  return options
    ? adapter.extract(page, url, options)
    : adapter.extract(page, url);
}
