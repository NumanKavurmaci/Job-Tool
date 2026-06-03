import type { Page } from "@playwright/test";
import type { ExtractedJobContent, JobAdapter } from "./types.js";
import {
  extractBodyText,
  extractSectionText,
  getAttributeBySelectors,
  getCurrentUrl,
  getTextBySelectors,
  gotoJobPage,
  optionalText,
} from "./helpers.js";

type AshbyPageData = {
  title: string | null;
  company: string | null;
  companyLogoUrl: string | null;
  location: string | null;
  workplaceType: string | null;
  employmentType: string | null;
  department: string | null;
  descriptionText: string | null;
  requirementsText: string | null;
  benefitsText: string | null;
};

function isAshbyJobUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      /(^|\.)jobs\.ashbyhq\.com$/i.test(parsed.hostname) &&
      /^\/[^/]+\/[0-9a-f-]{20,}(?:\/application)?\/?$/i.test(parsed.pathname)
    );
  } catch {
    return /jobs\.ashbyhq\.com\/[^/]+\/[0-9a-f-]{20,}(?:\/application)?/i.test(url);
  }
}

function buildApplicationUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (!/\/application\/?$/i.test(parsed.pathname)) {
      parsed.pathname = `${parsed.pathname.replace(/\/$/, "")}/application`;
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function appendLine(lines: string[], label: string, value: string | null | undefined) {
  if (value?.trim()) {
    lines.push(`${label}: ${value.trim()}`);
  }
}

async function getAshbyPageData(page: Page): Promise<AshbyPageData | null> {
  if (typeof (page as Page & { evaluate?: unknown }).evaluate !== "function") {
    return null;
  }

  /* c8 ignore start -- browser-context DOM traversal is exercised through Playwright, not node coverage */
  return page.evaluate(() => {
    const doc = (globalThis as any).document;
    const cleanText = (value: unknown) =>
      String(value ?? "").replace(/\s+/g, " ").trim();
    const htmlToText = (html: unknown) => {
      const template = doc.createElement("template");
      template.innerHTML = String(html ?? "");
      return cleanText(template.content.textContent);
    };
    const pickTextSection = (text: string, heading: string) => {
      const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(
        `${escapedHeading}\\s+([\\s\\S]*?)(?:\\b(?:About us|Key Responsibilities|Qualifications|Nice to have|Benefits|Interview Process|Life at|Location)\\b|$)`,
        "i",
      );
      return cleanText(text.match(pattern)?.[1]);
    };
    const appData = (globalThis as {
      __appData?: {
        organization?: {
          name?: string;
          theme?: {
            logoWordmarkImageUrl?: string | null;
            logoSquareImageUrl?: string | null;
          };
        };
        posting?: {
          title?: string;
          departmentName?: string;
          departmentExternalName?: string;
          locationName?: string;
          locationExternalName?: string;
          secondaryLocationNames?: string[];
          workplaceType?: string;
          employmentType?: string;
          descriptionHtml?: string;
          descriptionPlainText?: string;
          linkedData?: {
            hiringOrganization?: { name?: string; logo?: string };
            jobLocationType?: string;
            employmentType?: string;
            applicantLocationRequirements?: Array<{ name?: string }>;
          };
        } | null;
      };
    }).__appData;
    const posting = appData?.posting;
    const jsonLd = Array.from(doc.querySelectorAll("script[type='application/ld+json']"))
      .map((script) => {
        try {
          return JSON.parse((script as any).textContent ?? "null");
        } catch {
          return null;
        }
      })
      .find((entry) => entry?.["@type"] === "JobPosting");

    if (!posting && !jsonLd) {
      return null;
    }

    const descriptionText =
      cleanText(posting?.descriptionPlainText) ||
      htmlToText(posting?.descriptionHtml) ||
      htmlToText(jsonLd?.description);
    const locationValues = [
      posting?.locationExternalName,
      posting?.locationName,
      ...(posting?.secondaryLocationNames ?? []),
      ...(jsonLd?.applicantLocationRequirements ?? []).map((entry: { name?: string }) => entry.name),
    ]
      .map(cleanText)
      .filter(Boolean);

    return {
      title: cleanText(posting?.title) || cleanText(jsonLd?.title) || null,
      company:
        cleanText(appData?.organization?.name) ||
        cleanText(posting?.linkedData?.hiringOrganization?.name) ||
        cleanText(jsonLd?.hiringOrganization?.name) ||
        null,
      companyLogoUrl:
        cleanText(appData?.organization?.theme?.logoWordmarkImageUrl) ||
        cleanText(appData?.organization?.theme?.logoSquareImageUrl) ||
        cleanText(posting?.linkedData?.hiringOrganization?.logo) ||
        cleanText(jsonLd?.hiringOrganization?.logo) ||
        null,
      location: [...new Set(locationValues)].join("; ") || null,
      workplaceType:
        cleanText(posting?.workplaceType) ||
        (cleanText(posting?.linkedData?.jobLocationType || jsonLd?.jobLocationType) === "TELECOMMUTE"
          ? "Remote"
          : null),
      employmentType:
        cleanText(posting?.employmentType) ||
        cleanText(posting?.linkedData?.employmentType || jsonLd?.employmentType) ||
        null,
      department:
        cleanText(posting?.departmentExternalName) || cleanText(posting?.departmentName) || null,
      descriptionText: descriptionText || null,
      requirementsText:
        pickTextSection(descriptionText, "Qualifications") ||
        pickTextSection(descriptionText, "Requirements") ||
        null,
      benefitsText: pickTextSection(descriptionText, "Benefits") || null,
    };
  }).catch(() => null);
  /* c8 ignore stop */
}

export class AshbyAdapter implements JobAdapter {
  name = "ashby";

  canHandle(url: string): boolean {
    return isAshbyJobUrl(url);
  }

  async extract(page: Page, url: string): Promise<ExtractedJobContent> {
    await gotoJobPage(page, url);

    const data = await getAshbyPageData(page);
    const title =
      data?.title ??
      (await getTextBySelectors(page, [
        ".ashby-job-posting-heading",
        "meta[property='og:title']",
        "h1",
      ])) ??
      optionalText(await page.title());
    const company = data?.company ?? (await getTextBySelectors(page, ["meta[property='og:site_name']"]));
    const location = data?.location ?? (await getTextBySelectors(page, [
      ".ashby-job-posting-left-pane",
      "[class*='job-posting-left-pane']",
    ]));
    const applyUrl =
      (await getAttributeBySelectors(
        page,
        [
          "a[href*='/application']",
          "a:has-text('Apply for this Job')",
          "a:has-text('Application')",
        ],
        "href",
      )) ?? buildApplicationUrl(await getCurrentUrl(page));
    const descriptionText = data?.descriptionText ?? (await extractSectionText(page, [
      ".ashby-job-posting-right-pane-overview-tab",
      "[role='tabpanel']",
      "main",
    ]));

    const rawLines: string[] = [];
    appendLine(rawLines, "Title", title);
    appendLine(rawLines, "Company", company);
    appendLine(rawLines, "Location", location);
    appendLine(rawLines, "Workplace Type", data?.workplaceType);
    appendLine(rawLines, "Employment Type", data?.employmentType);
    appendLine(rawLines, "Department", data?.department);

    return {
      rawText: [rawLines.join("\n"), descriptionText ?? (await extractBodyText(page))]
        .filter(Boolean)
        .join("\n\n"),
      title,
      company,
      companyLogoUrl:
        data?.companyLogoUrl ??
        (await getAttributeBySelectors(page, ["meta[property='og:image']", "img[alt]"], "content")) ??
        (await getAttributeBySelectors(page, ["img[alt]"], "src")),
      companyLinkedinUrl: null,
      location,
      platform: this.name,
      applicationType: "external",
      rawWorkplaceType:
        data?.workplaceType?.toLowerCase() === "remote"
          ? "remote"
          : data?.workplaceType?.toLowerCase() === "hybrid"
            ? "hybrid"
            : data?.workplaceType?.toLowerCase().includes("site")
              ? "onsite"
              : null,
      applyUrl,
      currentUrl: await getCurrentUrl(page),
      descriptionText,
      requirementsText: data?.requirementsText ?? null,
      benefitsText: data?.benefitsText ?? null,
    };
  }
}
