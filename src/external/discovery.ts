import type { Page } from "@playwright/test";
import type { InputQuestion } from "../questions/types.js";
import type { CandidateProfile } from "../candidate/types.js";
import { resolveAnswer } from "../answers/resolveAnswer.js";
import type {
  ExternalApplicationDiscovery,
  ExternalApplicationField,
  ExternalApplicationFieldType,
  ExternalApplicationPlannedAnswer,
} from "./types.js";

const EXTERNAL_DISCOVERY_EVALUATE_SCRIPT = `(() => {
  const doc = globalThis.document;
  const cleanText = (value) => (value ?? "").replace(/\\s+/g, " ").trim();
  const dedupePrecursorLinks = (links) => {
    const seen = new Set();
    return links.filter((candidate) => {
      const key = cleanText(candidate?.href) || cleanText(candidate?.label);
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  };
  const hasSelector = (selector) => {
    try {
      return (doc?.querySelector?.(selector) ?? null) != null;
    } catch {
      return false;
    }
  };
  const findContextualLabel = (start) => {
    let current = start;
    while (current) {
      let sibling = current.previousElementSibling;
      while (sibling) {
        const candidate = cleanText(
          sibling.querySelector?.("h1,h2,h3,h4,h5,h6,label,legend")?.textContent ||
          sibling.textContent,
        );
        if (candidate) {
          return candidate;
        }
        sibling = sibling.previousElementSibling;
      }
      current = current.parentElement;
    }
    return "";
  };
  const describeField = (element, index) => {
    const tagName = String(element?.tagName ?? "").toLowerCase();
    const blockType = cleanText(element?.closest?.("[data-block-type]")?.getAttribute?.("data-block-type")).toUpperCase();
    const inputType =
      blockType === "INPUT_EMAIL"
        ? "email"
        : blockType === "INPUT_PHONE_NUMBER"
          ? "tel"
          : blockType === "INPUT_LINK"
            ? "url"
            : blockType === "INPUT_NUMBER"
              ? "number"
              : blockType === "TEXTAREA"
                ? "textarea"
                : blockType === "FILE_UPLOAD"
                  ? "file"
                  : blockType === "DROPDOWN"
                    ? "select"
                    : tagName === "textarea"
                      ? "textarea"
                      : tagName === "select"
                        ? "select"
                        : String(element?.getAttribute?.("type") ?? "text").toLowerCase();
    const id = element?.getAttribute?.("id");
    const name = element?.getAttribute?.("name");
    const labelFromFor = id ? cleanText(doc?.querySelector(\`label[for="\${id}"]\`)?.textContent) : "";
    const wrappingLabel = cleanText(element?.closest?.("label")?.textContent);
    const ariaLabel = cleanText(element?.getAttribute?.("aria-label"));
    const legend = cleanText(element?.closest?.("fieldset")?.querySelector?.("legend")?.textContent);
    const contextualLabel = findContextualLabel(element?.closest?.("[data-block-id]") ?? element?.parentElement ?? element);
    const previousHeading = cleanText(element?.parentElement?.querySelector?.("h1,h2,h3,h4,h5,h6,p")?.textContent);
    const placeholder = cleanText(element?.getAttribute?.("placeholder"));
    const label =
      labelFromFor ||
      wrappingLabel ||
      ariaLabel ||
      legend ||
      contextualLabel ||
      previousHeading ||
      placeholder ||
      name ||
      \`\${tagName}-\${index + 1}\`;

    const options =
      tagName === "select"
        ? Array.from(element?.options ?? []).map((option) => cleanText(option?.textContent)).filter(Boolean)
        : inputType === "radio" || inputType === "checkbox"
          ? Array.from(doc?.querySelectorAll(\`input[name="\${name ?? ""}"]\`) ?? [])
              .map((option) => {
                const optionId = option?.getAttribute?.("id");
                const labelText = optionId
                  ? cleanText(doc?.querySelector(\`label[for="\${optionId}"]\`)?.textContent)
                  : cleanText(option?.closest?.("label")?.textContent);
                return labelText || cleanText(option?.value);
              })
              .filter(Boolean)
          : [];

    return {
      key: name || id || \`\${tagName}-\${index + 1}\`,
      label,
      inputType,
      required:
        Boolean(element?.hasAttribute?.("required")) ||
        label.includes("*") ||
        cleanText(element?.closest?.("[aria-required='true']")?.textContent).length > 0,
      options,
      placeholder: placeholder || null,
      helpText: cleanText(element?.getAttribute?.("aria-description")) || null,
      accept: cleanText(element?.getAttribute?.("accept")) || null,
    };
  };

  const fieldNodes = Array.from(doc?.querySelectorAll?.("input, textarea, select") ?? []).filter((element) => {
    const tagName = String(element?.tagName ?? "").toLowerCase();
    if (tagName === "input") {
      const type = String(element?.getAttribute?.("type") ?? "text").toLowerCase();
      if (["hidden", "submit", "button", "reset", "image"].includes(type)) {
        return false;
      }
    }
    return !element?.disabled;
  });

  const uniqueFields = fieldNodes
    .map((element, index) => describeField(element, index))
    .filter((field, index, all) => all.findIndex((candidate) => candidate.key === field.key) === index);

  const genericPrecursorLinks = Array.from(doc?.querySelectorAll?.("a[href], button") ?? [])
    .map((element) => {
      const text = cleanText(element?.textContent) || cleanText(element?.getAttribute?.("aria-label"));
      const tagName = String(element?.tagName ?? "").toLowerCase();
      const href = tagName === "a" ? cleanText(element?.href) : cleanText(element?.dataset?.href);
      return { label: text, href };
    })
    .filter((candidate) => candidate.label && /apply|continue|start|next|begin/i.test(candidate.label) && Boolean(candidate.href));
  const leverPrecursorLinks = Array.from(
    doc?.querySelectorAll?.(
      "a[data-qa='show-page-apply'], a.postings-btn.template-btn-submit, a[href*='jobs.lever.co'][href$='/apply']",
    ) ?? [],
  )
    .map((element) => ({
      label: cleanText(element?.textContent) || cleanText(element?.getAttribute?.("aria-label")) || "Apply",
      href: cleanText(element?.href),
    }))
    .filter((candidate) => Boolean(candidate.href));
  const precursorLinks = dedupePrecursorLinks([
    ...leverPrecursorLinks,
    ...genericPrecursorLinks,
  ]);
  const precursorSignals = [
    hasSelector(".section-wrapper.page-full-width") ? "container:section-wrapper.page-full-width" : null,
    hasSelector(".section.page-centered[data-qa='job-description']") ? "container:lever-job-description" : null,
    hasSelector("a[data-qa='show-page-apply']") ? "cta:data-qa=show-page-apply" : null,
    hasSelector("a.postings-btn.template-btn-submit") ? "cta:postings-btn.template-btn-submit" : null,
    hasSelector("a[href*='jobs.lever.co'][href$='/apply']") ? "cta:lever-apply-link" : null,
  ].filter(Boolean);
  const precursorPage = uniqueFields.length === 0 && (precursorSignals.length > 0 || precursorLinks.length > 0);

  return {
    url: globalThis.location?.href ?? "",
    title: doc?.title ?? "",
    fields: uniqueFields,
    precursorPage,
    precursorSignals,
    precursorLinks,
  };
})()`;

const EXTERNAL_PAGE_TEXT_EVALUATE_SCRIPT = `(() => {
  return String(globalThis.document?.body?.innerText ?? "").replace(/\\s+/g, " ").trim();
})()`;

function inferPlatform(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes("greenhouse")) {
    return "greenhouse";
  }
  if (lower.includes("lever.co")) {
    return "lever";
  }
  if (lower.includes("ashby")) {
    return "ashby";
  }
  if (lower.includes("workday")) {
    return "workday";
  }
  if (lower.includes("tally.so")) {
    return "tally";
  }

  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "generic";
  }
}

function mapHtmlInputTypeToFieldType(inputType: string, options: string[]): ExternalApplicationFieldType {
  const normalized = inputType.toLowerCase();

  if (normalized === "textarea") {
    return "long_text";
  }
  if (normalized === "number") {
    return "number";
  }
  if (normalized === "email") {
    return "email";
  }
  if (normalized === "tel") {
    return "phone";
  }
  if (normalized === "url") {
    return "url";
  }
  if (normalized === "file") {
    return "file";
  }
  if (normalized === "radio") {
    return options.length === 2 ? "boolean" : "single_select";
  }
  if (normalized === "select") {
    return options.length === 2 ? "boolean" : "single_select";
  }
  if (normalized === "checkbox") {
    return options.length > 1 ? "multi_select" : "boolean";
  }

  return "short_text";
}

export async function discoverExternalApplication(
  page: Page,
  sourceUrl: string,
): Promise<ExternalApplicationDiscovery> {
  await page.goto(sourceUrl);
  await waitForExternalDiscoverySignals(page);
  return inspectExternalApplicationPageWithRetry(page, sourceUrl);
}

async function waitForExternalDiscoverySignals(page: Page): Promise<void> {
  if (typeof (page as Page & { waitForFunction?: unknown }).waitForFunction !== "function") {
    return;
  }

  const discoverySignal = [
    "input",
    "textarea",
    "select",
    "a[href]",
    "button",
    "[data-ui='apply-button']",
    "[data-qa='apply-button']",
    "[data-qa='show-page-apply']",
    ".postings-btn.template-btn-submit",
    ".section-wrapper.page-full-width",
    ".section.page-centered[data-qa='job-description']",
  ].join(", ");

  await page
    .waitForFunction(
      `selector => {
        const cleanText = value =>
          String(value ?? "")
            .replace(/\\s+/g, " ")
            .trim()
            .toLowerCase();
        const elements = Array.from(document.querySelectorAll(selector));
        return elements.some(element => {
          const tagName = String(element?.tagName ?? "").toLowerCase();
          const text = cleanText(element?.textContent);
          const ariaLabel = cleanText(element?.getAttribute?.("aria-label"));
          const dataUi = cleanText(element?.getAttribute?.("data-ui"));
          if (tagName === "input" || tagName === "textarea" || tagName === "select") {
            return true;
          }

          return (
            dataUi === "apply-button" ||
            /apply|continue|start|next|begin/.test(text) ||
            /apply|continue|start|next|begin/.test(ariaLabel)
          );
        });
      }`,
      discoverySignal,
      { timeout: 5_000 },
    )
    .catch(() => undefined);
}

export async function inspectExternalApplicationPage(
  page: Page,
  sourceUrl: string,
): Promise<ExternalApplicationDiscovery> {
  /* c8 ignore start -- browser-context DOM traversal is exercised through Playwright, not node unit tests */
  const inspected = (await page.evaluate(EXTERNAL_DISCOVERY_EVALUATE_SCRIPT)) as {
    url: string;
    title: string;
    precursorPage?: boolean;
    precursorSignals?: string[];
    fields: Array<{
      key: string;
      label: string;
      inputType: string;
      required: boolean;
      options: string[];
      placeholder: string | null;
      helpText: string | null;
      accept: string | null;
    }>;
    precursorLinks: Array<{ label: string; href: string }>;
  };
  /* c8 ignore stop */

  const fields: ExternalApplicationField[] = inspected.fields.map((field) => ({
    key: field.key,
    label: field.label,
    type: mapHtmlInputTypeToFieldType(field.inputType, field.options),
    required: field.required,
    options: field.options,
    placeholder: field.placeholder,
    helpText: field.helpText,
    accept: field.accept,
  }));

  return {
    sourceUrl,
    finalUrl: inspected.url,
    pageTitle: inspected.title,
    platform: inferPlatform(inspected.url),
    fields,
    precursorPage: inspected.precursorPage === true,
    precursorSignals: inspected.precursorSignals ?? [],
    precursorLinks: inspected.precursorLinks,
    followedPrecursorLink: null,
  };
}

async function inspectExternalApplicationPageWithRetry(
  page: Page,
  sourceUrl: string,
): Promise<ExternalApplicationDiscovery> {
  let inspection = await inspectExternalApplicationPage(page, sourceUrl);
  if (inspection.fields.length > 0 || inspection.precursorLinks.length > 0) {
    return inspection;
  }

  const waitForTimeout = (page as Page & { waitForTimeout?: unknown }).waitForTimeout;
  if (typeof waitForTimeout !== "function") {
    return inspection;
  }

  for (const delayMs of [500, 1000]) {
    await page.waitForTimeout(delayMs);
    inspection = await inspectExternalApplicationPage(page, sourceUrl);
    if (inspection.fields.length > 0 || inspection.precursorLinks.length > 0) {
      return inspection;
    }
  }

  return inspection;
}

export async function extractExternalPageText(page: Page): Promise<string> {
  return page
    .evaluate(EXTERNAL_PAGE_TEXT_EVALUATE_SCRIPT)
    .then((value) => String(value))
    .catch(() => "");
}

export async function followExternalApplicationLink(
  page: Page,
  sourceUrl: string,
  href: string,
): Promise<ExternalApplicationDiscovery> {
  await page.goto(href);
  const discovered = await inspectExternalApplicationPageWithRetry(page, sourceUrl);
  return {
    ...discovered,
    followedPrecursorLink: href,
  };
}

function toInputQuestion(field: ExternalApplicationField): InputQuestion {
  return {
    label: field.label,
    helpText: field.helpText,
    placeholder: field.placeholder,
    inputType: field.type,
    ...(field.options.length > 0 ? { options: field.options } : {}),
  };
}

function looksSyntheticFieldLabel(field: ExternalApplicationField): boolean {
  const label = field.label.trim().toLowerCase();
  const placeholder = field.placeholder?.trim().toLowerCase() ?? "";
  const helpText = field.helpText?.trim().toLowerCase() ?? "";
  const hasHumanSignal = Boolean(placeholder || helpText || field.options.length > 0);

  if (hasHumanSignal) {
    return false;
  }

  return /^(input|textarea|select|field)[\s_-]?\d+$/i.test(label);
}

export async function planExternalApplicationAnswers(input: {
  fields: ExternalApplicationField[];
  candidateProfile: CandidateProfile;
  pageContext?: {
    title?: string | null;
    text?: string | null;
    sourceUrl?: string | null;
  } | null;
}): Promise<ExternalApplicationPlannedAnswer[]> {
  const plans: ExternalApplicationPlannedAnswer[] = [];

  for (const field of input.fields) {
    const question = toInputQuestion(field);

    if (looksSyntheticFieldLabel(field)) {
      plans.push({
        fieldKey: field.key,
        fieldLabel: field.label,
        fieldType: field.type,
        question,
        answer: null,
        source: "manual",
        confidenceLabel: "manual_review",
        notes: "Skipped because the field label looks synthetic or trap-like.",
      });
      continue;
    }

    if (field.type === "file") {
      plans.push({
        fieldKey: field.key,
        fieldLabel: field.label,
        fieldType: field.type,
        question,
        answer: input.candidateProfile.sourceMetadata.resumePath ?? null,
        source: "candidate-profile",
        confidenceLabel: input.candidateProfile.sourceMetadata.resumePath ? "high" : "manual_review",
        ...(input.candidateProfile.sourceMetadata.resumePath
          ? { notes: "Will use the configured resume file for upload." }
          : { notes: "No resume path was available in the loaded candidate profile." }),
      });
      continue;
    }

    const resolved = await resolveAnswer({
      question,
      candidateProfile: input.candidateProfile,
      ...(input.pageContext !== undefined ? { pageContext: input.pageContext } : {}),
    });
    const normalizedAnswer =
      resolved.answer == null
        ? null
        : Array.isArray(resolved.answer)
          ? resolved.answer.join(", ")
          : typeof resolved.answer === "boolean"
            ? resolved.answer
              ? "Yes"
              : "No"
            : String(resolved.answer);

    plans.push({
      fieldKey: field.key,
      fieldLabel: field.label,
      fieldType: field.type,
      question,
      answer: normalizedAnswer,
      source: resolved.source,
      confidenceLabel: resolved.confidenceLabel,
      ...(resolved.notes
        ? {
            notes: Array.isArray(resolved.notes) ? resolved.notes.join(" ") : String(resolved.notes),
          }
        : {}),
    });
  }

  return plans;
}
