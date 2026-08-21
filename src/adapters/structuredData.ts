import type { Page } from "@playwright/test";

export type StructuredJobPosting = {
  title: string | null;
  company: string | null;
  companyLogoUrl: string | null;
  location: string | null;
  workplaceType: string | null;
  employmentType: string | null;
  descriptionText: string | null;
  requirementsText: string | null;
  benefitsText: string | null;
  canonicalUrl: string | null;
};

export async function extractJobPostingStructuredData(
  page: Page,
): Promise<StructuredJobPosting | null> {
  if (typeof (page as Page & { evaluate?: unknown }).evaluate !== "function") {
    return null;
  }

  /* c8 ignore start -- browser-context DOM parsing is covered with fixture-backed adapter tests */
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
    const valueToText = (value: unknown): string => {
      if (Array.isArray(value)) return value.map(valueToText).filter(Boolean).join("\n");
      if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        return htmlToText(record.name ?? record.value ?? record.description ?? "");
      }
      return htmlToText(value);
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
    if (!posting) return null;

    const jobLocations = Array.isArray(posting.jobLocation)
      ? posting.jobLocation
      : posting.jobLocation ? [posting.jobLocation] : [];
    const applicantLocations = Array.isArray(posting.applicantLocationRequirements)
      ? posting.applicantLocationRequirements
      : posting.applicantLocationRequirements ? [posting.applicantLocationRequirements] : [];
    const locations = [
      ...jobLocations.flatMap((item: any) => {
        const address = item?.address ?? item;
        return [
          address?.addressLocality,
          address?.addressRegion,
          address?.addressCountry?.name ?? address?.addressCountry,
        ];
      }),
      ...applicantLocations.map((item: any) => item?.name ?? item),
    ].map(clean).filter(Boolean);
    const requirements = [
      posting.qualifications,
      posting.experienceRequirements,
      posting.educationRequirements,
      posting.skills,
    ].map(valueToText).filter(Boolean);
    const organization = Array.isArray(posting.hiringOrganization)
      ? posting.hiringOrganization[0]
      : posting.hiringOrganization;

    return {
      title: clean(posting.title) || null,
      company: clean(organization?.name) || null,
      companyLogoUrl: clean(organization?.logo?.url ?? organization?.logo) || null,
      location: [...new Set(locations)].join(", ") || null,
      workplaceType: clean(posting.jobLocationType) || null,
      employmentType: valueToText(posting.employmentType) || null,
      descriptionText: htmlToText(posting.description) || null,
      requirementsText: [...new Set(requirements)].join("\n") || null,
      benefitsText: valueToText(posting.jobBenefits) || null,
      canonicalUrl: clean(posting.url) || null,
    };
  }).catch(() => null);
  /* c8 ignore stop */
}

export function resolveHttpUrl(value: string | null | undefined, baseUrl: string): string | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = new URL(value, baseUrl);
    return /^https?:$/.test(parsed.protocol) && !parsed.username && !parsed.password
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

export function normalizeStructuredWorkplaceType(
  value: string | null | undefined,
): "remote" | "hybrid" | "onsite" | null {
  const normalized = value?.toLowerCase() ?? "";
  if (/telecommute|remote|uzaktan/.test(normalized)) return "remote";
  if (/hybrid|hibrit/.test(normalized)) return "hybrid";
  if (/on.?site|office|iş yerinde|is yerinde/.test(normalized)) return "onsite";
  return null;
}
