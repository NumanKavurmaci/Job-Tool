import type { Page } from "@playwright/test";
import type { KariyerNavigationContext } from "../kariyer/pageState.js";

export interface JobExtractionOptions {
  kariyerNavigationContext?: KariyerNavigationContext;
}

export interface ExtractedJobContent {
  rawText: string;
  title: string | null;
  company: string | null;
  companyLogoUrl: string | null;
  companyLinkedinUrl: string | null;
  location: string | null;
  platform: string;
  applicationType: "easy_apply" | "external" | "unknown";
  applicationStatus?: "open" | "closed" | "unknown";
  alreadyApplied?: boolean;
  rawWorkplaceType?: "remote" | "hybrid" | "onsite" | null;
  rawApplicationType?: "easy_apply" | "external" | "unknown" | null;
  locationSource?: string | null;
  applyUrl: string | null;
  currentUrl: string;
  descriptionText: string | null;
  requirementsText: string | null;
  benefitsText: string | null;
}

export interface JobAdapter {
  name: string;
  canHandle(url: string): boolean;
  extract(
    page: Page,
    url: string,
    options?: JobExtractionOptions,
  ): Promise<ExtractedJobContent>;
}
