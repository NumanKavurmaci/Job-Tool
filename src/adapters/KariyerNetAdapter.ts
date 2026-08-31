import type { Page } from "@playwright/test";
import type {
  ExtractedJobContent,
  JobAdapter,
  JobExtractionOptions,
} from "./types.js";
import {
  inspectKariyerPageOrThrow,
  navigateKariyerPage,
} from "../kariyer/pageState.js";
import {
  extractBodyText,
  extractSectionText,
  getAttributeBySelectors,
  getCurrentUrl,
  getTextBySelectors,
  optionalText,
} from "./helpers.js";

type KariyerStructuredData = {
  title: string | null;
  company: string | null;
  companyLogoUrl: string | null;
  location: string | null;
  workplaceType: string | null;
  descriptionText: string | null;
  requirementsText: string | null;
  benefitsText: string | null;
  applyUrl: string | null;
  expired: boolean;
};

const CLOSED_TEXT_PATTERN =
  /(?:bu ilan|ilan).*?(?:başvuruları|basvurulari).*?(?:artık|artik).*?(?:kabul etmiyor|sona erdi)|ilan (?:yayından|yayindan) kaldırıldı|başvuru süresi sona erdi|applications? (?:are )?closed|no longer accepting applications/i;

const APPLIED_STATUS_PATTERN =
  /\b(?:(?:bu\s+)?ilana\s+basvurdunuz|basvuruldu|basvuru(?:n(?:uz)?)?\s+(?:(?:sirkete|firmaya|isverene)\s+)?(?:iletildi|alindi|gonderildi|tamamlandi|yapildi|goruntulendi|incelendi|inceleniyor|degerlendiriliyor|degerlendirmede|reddedildi|sonuclandi|isleme\s+alindi))\b/i;

const APPLIED_STATUS_POLL_ATTEMPTS = 6;
const APPLIED_STATUS_POLL_INTERVAL_MS = 400;
const APPLIED_STATUS_TEXT_SELECTORS = [
  "[data-test='application-status-list'] [data-test='interaction-label']",
  "[data-test='application-status-item'] [data-test='interaction-label']",
  "[data-test='interaction-label']",
] as const;

function isKariyerHostname(hostname: string): boolean {
  return /^(?:www\.)?kariyer\.net$/i.test(hostname.replace(/\.$/, ""));
}

export function isKariyerNetJobUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      (!parsed.port || parsed.port === "443") &&
      /^(?:www\.)?kariyer\.net$/i.test(parsed.hostname) &&
      /^\/is-ilani\/[a-z0-9çğıöşü-]+-\d+\/?$/i.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

function appendLine(lines: string[], label: string, value: string | null | undefined) {
  if (value?.trim()) {
    lines.push(`${label}: ${value.trim()}`);
  }
}

function normalizeKariyerStatusText(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/ı/g, "i")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAppliedStatusText(value: string | null): boolean {
  return value ? APPLIED_STATUS_PATTERN.test(normalizeKariyerStatusText(value)) : false;
}

async function getVisibleText(page: Page, selector: string): Promise<string | null> {
  const candidates = page.locator(selector);
  const count = await candidates.count().catch(() => 0);
  const texts: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const candidate = candidates.nth(index);
    if (!(await candidate.isVisible().catch(() => false))) {
      continue;
    }

    const text = optionalText(await candidate.innerText().catch(() => null));
    if (text) {
      texts.push(text);
    }
  }

  return texts.length > 0 ? texts.join("\n") : null;
}

async function hasVisibleSelector(page: Page, selector: string): Promise<boolean> {
  const candidates = page.locator(selector);
  const count = await candidates.count().catch(() => 0);
  for (let index = 0; index < count; index += 1) {
    if (await candidates.nth(index).isVisible().catch(() => false)) {
      return true;
    }
  }

  return false;
}

async function readKariyerAlreadyApplied(page: Page): Promise<boolean> {
  for (const selector of APPLIED_STATUS_TEXT_SELECTORS) {
    if (hasAppliedStatusText(await getVisibleText(page, selector))) {
      return true;
    }
  }

  const statusListText = await getVisibleText(page, "[data-test='application-status-list']");
  if (!statusListText) {
    return false;
  }
  if (hasAppliedStatusText(statusListText)) {
    return true;
  }

  return (
    (await hasVisibleSelector(page, "[data-test='application-status-item']")) &&
    (await hasVisibleSelector(page, "[data-test='cv-detail-link']"))
  );
}

async function detectKariyerAlreadyApplied(page: Page): Promise<boolean> {
  for (let attempt = 0; attempt < APPLIED_STATUS_POLL_ATTEMPTS; attempt += 1) {
    if (await readKariyerAlreadyApplied(page)) {
      return true;
    }

    if (attempt < APPLIED_STATUS_POLL_ATTEMPTS - 1) {
      await page.waitForTimeout(APPLIED_STATUS_POLL_INTERVAL_MS);
    }
  }

  return false;
}

function normalizeWorkplaceType(
  value: string | null | undefined,
): "remote" | "hybrid" | "onsite" | null {
  const normalized = value?.toLocaleLowerCase("tr-TR") ?? "";
  if (/remote|telecommute|uzaktan/.test(normalized)) {
    return "remote";
  }
  if (/hybrid|hibrit/.test(normalized)) {
    return "hybrid";
  }
  if (/on.?site|iş yerinde|is yerinde|ofis|saha/.test(normalized)) {
    return "onsite";
  }
  return null;
}

function resolveHttpUrl(value: string | null, baseUrl: string): string | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = new URL(value, baseUrl);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function splitKariyerDescription(value: string | null): {
  descriptionText: string | null;
  requirementsText: string | null;
} {
  const text = value?.replace(/\r\n?/g, "\n").trim();
  if (!text) {
    return { descriptionText: null, requirementsText: null };
  }

  const requirementsMatch = /(?:^|\n|\s)Nitelikler\s*:?\s*/i.exec(text);
  if (!requirementsMatch || requirementsMatch.index === undefined) {
    return {
      descriptionText: text.replace(/^\s*İş\s+Tanımı\s*:?\s*/i, "").trim() || null,
      requirementsText: null,
    };
  }

  const description = text
    .slice(0, requirementsMatch.index)
    .replace(/^\s*İş\s+Tanımı\s*:?\s*/i, "")
    .trim();
  const requirements = text.slice(requirementsMatch.index + requirementsMatch[0].length).trim();
  return {
    descriptionText: description || null,
    requirementsText: requirements || null,
  };
}

async function getKariyerStructuredData(page: Page): Promise<KariyerStructuredData | null> {
  if (typeof (page as Page & { evaluate?: unknown }).evaluate !== "function") {
    return null;
  }

  /* c8 ignore start -- executed inside the browser and covered by fixture-backed adapter tests */
  return page.evaluate(() => {
    const doc = (globalThis as any).document;
    const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
    const htmlToText = (value: unknown) => {
      if (!value) return "";
      const template = doc.createElement("template");
      template.innerHTML = String(value);
      return clean(template.content.textContent);
    };
    const flatten = (value: unknown): any[] => {
      if (Array.isArray(value)) return value.flatMap(flatten);
      if (value && typeof value === "object" && Array.isArray((value as any)["@graph"])) {
        return flatten((value as any)["@graph"]);
      }
      return value && typeof value === "object" ? [value] : [];
    };
    const entries = Array.from(doc.querySelectorAll("script[type='application/ld+json']"))
      .flatMap((script) => {
        try {
          return flatten(JSON.parse((script as any).textContent ?? "null"));
        } catch {
          return [];
        }
      });
    const posting = entries.find((entry) => {
      const types = Array.isArray(entry?.["@type"]) ? entry["@type"] : [entry?.["@type"]];
      return types.some((type: unknown) => clean(type).toLowerCase() === "jobposting");
    });
    const text = (selector: string) => clean(doc.querySelector(selector)?.textContent) || null;
    const texts = (selector: string) =>
      Array.from(doc.querySelectorAll(selector)).map((item: any) => clean(item.textContent)).filter(Boolean);
    const featureItems = texts("[data-test='job-feature-item']");
    const criteriaTitles = texts("[data-test='alignment-list-title']");
    const criteriaValues = texts("[data-test='alignment-list-value']");
    const visibleCriteria = criteriaTitles
      .map((title: string, index: number) => {
        const value = criteriaValues[index];
        return value ? `${title}: ${value}` : title;
      })
      .join("\n");

    if (!posting) {
      return {
        title: text("[data-test='job-title']"),
        company: text("[data-test='company-name']"),
        companyLogoUrl: null,
        location: text("[data-test='company-location']"),
        workplaceType:
          featureItems.find((item: string) => /uzaktan|hibrit|iş yerinde|is yerinde|ofis/i.test(item)) ?? null,
        descriptionText: text("[data-test='qualifications-and-job-description']"),
        requirementsText: visibleCriteria || null,
        benefitsText: featureItems.join("\n") || null,
        applyUrl: null,
        expired: false,
      };
    }

    const address = Array.isArray(posting.jobLocation)
      ? posting.jobLocation[0]?.address
      : posting.jobLocation?.address;
    const locations = [
      address?.addressLocality,
      address?.addressRegion,
      address?.addressCountry?.name ?? address?.addressCountry,
      ...(Array.isArray(posting.applicantLocationRequirements)
        ? posting.applicantLocationRequirements.map((item: any) => item?.name)
        : [posting.applicantLocationRequirements?.name]),
    ].map(clean).filter(Boolean);
    const requirements = [
      posting.qualifications,
      posting.experienceRequirements,
      posting.educationRequirements,
      posting.skills,
    ].map(htmlToText).filter(Boolean).join("\n");
    const validThrough = Date.parse(clean(posting.validThrough));

    return {
      title: clean(posting.title) || null,
      company: clean(posting.hiringOrganization?.name) || null,
      companyLogoUrl: clean(posting.hiringOrganization?.logo?.url ?? posting.hiringOrganization?.logo) || null,
      location: [...new Set(locations)].join(", ") || null,
      workplaceType: clean(posting.jobLocationType) || null,
      descriptionText: htmlToText(posting.description) || null,
      requirementsText: requirements || visibleCriteria || null,
      benefitsText: htmlToText(posting.jobBenefits) || featureItems.join("\n") || null,
      applyUrl: clean(posting.url) || null,
      expired: Number.isFinite(validThrough) && validThrough < Date.now(),
    };
  }).catch(() => null);
  /* c8 ignore stop */
}

export class KariyerNetAdapter implements JobAdapter {
  name = "kariyer";

  canHandle(url: string): boolean {
    return isKariyerNetJobUrl(url);
  }

  async extract(
    page: Page,
    url: string,
    options?: JobExtractionOptions,
  ): Promise<ExtractedJobContent> {
    if (!this.canHandle(url)) {
      throw new Error("KariyerNetAdapter only accepts canonical kariyer.net job-detail URLs.");
    }
    await navigateKariyerPage(page, url, {
      ...(options?.kariyerNavigationContext
        ? { navigationContext: options.kariyerNavigationContext }
        : {}),
      gotoOptions: { waitUntil: "domcontentloaded", timeout: 60_000 },
      safetyOptions: {
        requireHttps: true,
        allowedHostname: isKariyerHostname,
        context: "Kariyer.net job detail navigation",
      },
      context: "Kariyer.net job detail navigation",
    });
    await page.waitForTimeout(2_000);
    await inspectKariyerPageOrThrow(
      page,
      "Kariyer.net job detail hydration",
      undefined,
      options?.kariyerNavigationContext?.now(),
    );

    const currentUrl = await getCurrentUrl(page);
    const structured = await getKariyerStructuredData(page);
    const bodyText = await extractBodyText(page);
    const alreadyApplied = await detectKariyerAlreadyApplied(page);
    const meta = (selectors: string[]) => getAttributeBySelectors(page, selectors, "content");

    const title =
      (await getTextBySelectors(page, [
        "[data-test='job-title']",
        "[data-testid='job-title']",
        "[data-test='job-detail-title']",
      ])) ??
      structured?.title ??
      (await meta(["meta[property='og:title']", "meta[name='twitter:title']"])) ??
      (await getTextBySelectors(page, ["main h1", "h1"])) ??
      optionalText(await page.title());
    const company =
      (await getTextBySelectors(page, [
        "[data-test='company-name']",
        "[data-testid='company-name']",
        "[data-test='job-company-name']",
      ])) ??
      structured?.company ??
      (await meta(["meta[property='og:site_name']"]));
    const location =
      (await getTextBySelectors(page, [
        "[data-test='company-location']",
        "[data-test='job-location']",
        "[data-testid='job-location']",
        "[data-test='job-detail-location']",
      ])) ?? structured?.location ?? null;
    const workplaceLabel =
      (await getTextBySelectors(page, [
        "[data-test='job-feature-item']",
        "[data-test='workplace-type']",
        "[data-testid='workplace-type']",
        "[data-test='working-model']",
      ])) ?? structured?.workplaceType ?? null;
    const combinedDescriptionText =
      (await extractSectionText(page, [
        "[data-test='qualifications-and-job-description']",
        "[data-test='job-description']",
        "[data-testid='job-description']",
        "[data-test='job-detail-description']",
        "[class*='job-description']",
      ])) ??
      structured?.descriptionText ??
      (await meta(["meta[name='description']", "meta[property='og:description']"]));
    const splitDescription = splitKariyerDescription(combinedDescriptionText);
    const descriptionText = splitDescription.descriptionText;
    const requirementsText =
      (await extractSectionText(page, [
        "[data-test='job-requirements']",
        "[data-testid='job-requirements']",
        "[data-test='candidate-criteria']",
        "[data-testid='candidate-criteria']",
        "[class*='candidate-criteria']",
      ])) ?? structured?.requirementsText ?? splitDescription.requirementsText ?? null;
    const benefitsText =
      (await extractSectionText(page, [
        "[data-test='job-benefits']",
        "[data-testid='job-benefits']",
        "[data-test='job-features']",
        "[data-testid='job-features']",
        "[class*='job-benefit']",
      ])) ?? structured?.benefitsText ?? null;

    const closed = structured?.expired === true || CLOSED_TEXT_PATTERN.test(bodyText);
    const rawApplyUrl = closed || alreadyApplied
      ? null
      : await getAttributeBySelectors(
          page,
          [
            "a[data-test='apply-button']",
            "a[data-testid='apply-button']",
            "a[data-test='job-apply-button']",
            "a:has-text('Başvur')",
            "a:has-text('Basvur')",
          ],
          "href",
        );
    const applyUrl = closed || alreadyApplied
      ? null
      : resolveHttpUrl(rawApplyUrl ?? structured?.applyUrl ?? currentUrl, currentUrl);
    const applicationType = closed || alreadyApplied ? "unknown" : "external";

    const rawLines: string[] = [];
    appendLine(rawLines, "Title", title);
    appendLine(rawLines, "Company", company);
    appendLine(rawLines, "Location", location);
    appendLine(rawLines, "Workplace Type", workplaceLabel);
    rawLines.push(`Application Status: ${closed ? "closed" : "open"}`);
    if (alreadyApplied) {
      rawLines.push("Candidate Application Status: already_applied");
    }

    return {
      rawText: [rawLines.join("\n"), descriptionText, requirementsText, benefitsText, bodyText]
        .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index)
        .join("\n\n"),
      title,
      company,
      companyLogoUrl:
        structured?.companyLogoUrl ??
        (await meta(["meta[property='og:image']", "meta[name='twitter:image']"])) ??
        (await getAttributeBySelectors(page, ["[data-test='company-logo'] img", "img[alt*='logo' i']"], "src")),
      companyLinkedinUrl: null,
      location,
      platform: this.name,
      applicationType,
      applicationStatus: closed ? "closed" : "open",
      ...(alreadyApplied ? { alreadyApplied: true } : {}),
      rawWorkplaceType: normalizeWorkplaceType(workplaceLabel),
      rawApplicationType: applicationType,
      locationSource: location ? (structured?.location === location ? "structured-data" : "page") : null,
      applyUrl,
      currentUrl,
      descriptionText,
      requirementsText,
      benefitsText,
    };
  }
}
