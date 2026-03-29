import type { Page } from "@playwright/test";

export interface ExtractedJobContent {
  rawText: string;
  title: string | null;
  company: string | null;
  companyLogoUrl: string | null;
  location: string | null;
  platform: string;
  applicationType: "easy_apply" | "external" | "unknown";
  applyUrl: string | null;
  currentUrl: string;
  descriptionText: string | null;
  requirementsText: string | null;
  benefitsText: string | null;
}

export interface JobAdapter {
  name: string;
  canHandle(url: string): boolean;
  extract(page: Page, url: string): Promise<ExtractedJobContent>;
}
