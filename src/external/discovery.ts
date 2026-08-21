import type { Page } from "@playwright/test";
import type { InputQuestion } from "../questions/types.js";
import type { CandidateProfile } from "../candidate/types.js";
import { resolveAnswer } from "../answers/resolveAnswer.js";
import { acceptAllCookiePrompts } from "../browser/cookies.js";
import {
  assertSafeNavigationUrl,
  safePageGoto,
  UnsafeNavigationUrlError,
  type NavigationHostnameResolver,
} from "../security/navigationSafety.js";
import type {
  ExternalApplicationDiscovery,
  ExternalApplicationField,
  ExternalApplicationFieldType,
  ExternalApplicationPlannedAnswer,
} from "./types.js";
import {
  annotateSemanticFields as annotateSemanticFieldsWithPlatform,
  resolveSemanticExternalAnswer as resolveSemanticExternalAnswerWithPlatform,
} from "./semantics.js";

export type ExternalDiscoveryRetryPolicy = {
  delayedEmbedRetryDelaysMs: number[];
  signalTimeoutMs: number;
  /** Test-only escape hatch for deliberately local browser fixtures. */
  allowPrivateHosts?: boolean;
  /** Resolver injection for deterministic browser tests; production uses Node DNS. */
  hostnameResolver?: NavigationHostnameResolver;
};

export const DEFAULT_EXTERNAL_DISCOVERY_RETRY_POLICY: ExternalDiscoveryRetryPolicy = {
  delayedEmbedRetryDelaysMs: [500, 1000, 2500, 5000],
  signalTimeoutMs: 5_000,
};

function externalNavigationOptions(
  retryPolicy: ExternalDiscoveryRetryPolicy,
  context: string,
) {
  return {
    allowPrivateHosts: retryPolicy.allowPrivateHosts === true,
    requireHttps: retryPolicy.allowPrivateHosts !== true,
    ...(retryPolicy.hostnameResolver
      ? { hostnameResolver: retryPolicy.hostnameResolver }
      : {}),
    context,
  };
}

function resolveExternalNavigationCandidate(
  value: string,
  baseUrl: string,
  retryPolicy: ExternalDiscoveryRetryPolicy,
): string {
  let resolved: string;
  try {
    resolved = new URL(value, baseUrl).toString();
  } catch {
    resolved = value;
  }

  assertSafeNavigationUrl(
    resolved,
    externalNavigationOptions(retryPolicy, "External application candidate"),
  );
  return resolved;
}

function getExternalPageUrl(page: Page, fallbackUrl: string): string {
  const pageWithOptionalUrl = page as Page & { url?: Page["url"] };
  return typeof pageWithOptionalUrl.url === "function" ? pageWithOptionalUrl.url() : fallbackUrl;
}

async function tryNavigateToExternalCandidate(
  page: Page,
  value: string,
  baseUrl: string,
  retryPolicy: ExternalDiscoveryRetryPolicy,
  context: string,
): Promise<string | null> {
  try {
    const candidateUrl = resolveExternalNavigationCandidate(value, baseUrl, retryPolicy);
    await safePageGoto(
      page,
      candidateUrl,
      undefined,
      externalNavigationOptions(retryPolicy, context),
    );
    return candidateUrl;
  } catch (error) {
    if (error instanceof UnsafeNavigationUrlError) {
      return null;
    }
    throw error;
  }
}

const EXTERNAL_DISCOVERY_EVALUATE_SCRIPT = `(() => {
  const doc = globalThis.document;
  const applyTextPattern = /\\b(apply|continue|start|next|begin)\\b|başvur|basvur|devam|ileri|sonraki|başla|basla/i;
  const cleanText = (value) => (value ?? "").replace(/\\s+/g, " ").trim();
  const normalizeToken = (value) => cleanText(value).toLowerCase();
  const removeNestedInputs = (element) => {
    const clone = element?.cloneNode?.(true);
    if (!clone || typeof clone.querySelectorAll !== "function") {
      return cleanText(element?.textContent);
    }
    clone.querySelectorAll("input, textarea, select, button").forEach((node) => node.remove());
    return cleanText(clone.textContent);
  };
  const isErrorElement = (element) => {
    const className = cleanText(element?.getAttribute?.("class")).toLowerCase();
    return /error|invalid|feedback/.test(className);
  };
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
  const looksCookieOrConsentContainer = (element) => {
    const nodes = [
      element,
      element?.parentElement,
      element?.closest?.("[id], [class], [role], [data-testid], [aria-label]"),
    ].filter(Boolean);
    const combined = nodes
      .map((node) =>
        cleanText(
          [
            node?.getAttribute?.("id"),
            node?.getAttribute?.("class"),
            node?.getAttribute?.("role"),
            node?.getAttribute?.("data-testid"),
            node?.getAttribute?.("aria-label"),
          ]
            .filter(Boolean)
            .join(" "),
        ),
      )
      .join(" ")
      .toLowerCase();
    return /cookie|cybot|cookiedialog|cookiebot|privacy-banner/.test(combined);
  };
  const looksSearchField = (element, label, placeholder) => {
    const inputType = normalizeToken(element?.getAttribute?.("type"));
    const combined = [
      label,
      placeholder,
      element?.getAttribute?.("name"),
      element?.getAttribute?.("id"),
      element?.getAttribute?.("aria-label"),
    ]
      .map(normalizeToken)
      .join(" ");
    return inputType === "search" || /\\bsearch\\b|\\bzoeken\\b|zoekterm/.test(combined);
  };
  const isAntiBotField = (element) => {
    const combined = cleanText(
      [
        element?.getAttribute?.("id"),
        element?.getAttribute?.("name"),
        element?.getAttribute?.("class"),
        element?.getAttribute?.("aria-label"),
      ]
        .filter(Boolean)
        .join(" "),
    ).toLowerCase();
    return /recaptcha|g-recaptcha|hcaptcha|turnstile|captcha/.test(combined);
  };
  const isVisiblyHiddenField = (element) => {
    if (!element) {
      return true;
    }
    if (element?.hasAttribute?.("hidden")) {
      return true;
    }
    const style = globalThis.getComputedStyle?.(element);
    if (style) {
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
        return true;
      }
    }
    const ariaHidden = cleanText(element?.getAttribute?.("aria-hidden")).toLowerCase();
    if (ariaHidden === "true") {
      return true;
    }
    const rects = typeof element?.getClientRects === "function" ? element.getClientRects() : [];
    return rects.length === 0;
  };
  const findContextualLabel = (start) => {
    let current = start;
    while (current) {
      let sibling = current.previousElementSibling;
      while (sibling) {
        if (isErrorElement(sibling)) {
          sibling = sibling.previousElementSibling;
          continue;
        }
        const candidate = cleanText(
          sibling.matches?.("h1,h2,h3,h4,h5,h6,label,legend")
            ? sibling.textContent
            : sibling.querySelector?.("h1,h2,h3,h4,h5,h6,label,legend")?.textContent,
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
  const findImmediateHeadingLabel = (element) => {
    let sibling = element?.previousElementSibling;
    while (sibling) {
      if (isErrorElement(sibling)) {
        sibling = sibling.previousElementSibling;
        continue;
      }
      const candidate = cleanText(
        sibling.matches?.("h1,h2,h3,h4,h5,h6,label,legend")
          ? sibling.textContent
          : sibling.querySelector?.("h1,h2,h3,h4,h5,h6,label,legend")?.textContent,
      );
      if (candidate) {
        return candidate;
      }
      sibling = sibling.previousElementSibling;
    }
    return "";
  };
  const findCheckboxOptionLabel = (element) => {
    const inputType = String(element?.getAttribute?.("type") ?? "").toLowerCase();
    if (!["checkbox", "radio"].includes(inputType)) {
      return "";
    }
    const optionContainer =
      element?.closest?.("label, li, .option, .consent-form") ?? element?.parentElement;
    return removeNestedInputs(optionContainer);
  };
  const describeField = (element, index) => {
    const tagName = String(element?.tagName ?? "").toLowerCase();
    const blockType = cleanText(element?.closest?.("[data-block-type]")?.getAttribute?.("data-block-type")).toUpperCase();
    const rawInputType = String(element?.getAttribute?.("type") ?? "text").toLowerCase();
    const rawRole = cleanText(element?.getAttribute?.("role")).toLowerCase();
    const rawClassName = cleanText(element?.getAttribute?.("class")).toLowerCase();
    const labelledBy = cleanText(element?.getAttribute?.("aria-labelledby"));
    const labelledByText = labelledBy
      ? labelledBy
          .split(/\s+/)
          .map((id) => cleanText(doc?.getElementById?.(id)?.textContent))
          .filter(Boolean)
          .join(" ")
      : "";
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
                    : rawRole === "combobox" || rawClassName.includes("select__input")
                      ? "select"
                    : tagName === "textarea"
                      ? "textarea"
                      : tagName === "select"
                        ? "select"
                        : rawInputType;
    const id = element?.getAttribute?.("id");
    const name = element?.getAttribute?.("name");
    const dataUi = cleanText(element?.getAttribute?.("data-ui"));
    const ngModel = cleanText(element?.getAttribute?.("ng-model"));
    const labelFromFor = id ? cleanText(doc?.querySelector(\`label[for="\${id}"]\`)?.textContent) : "";
    const wrappingLabel = removeNestedInputs(element?.closest?.("label"));
    const checkboxOptionLabel = findCheckboxOptionLabel(element);
    const immediateHeadingLabel = findImmediateHeadingLabel(element);
    const ariaLabel = cleanText(element?.getAttribute?.("aria-label")) || labelledByText;
    const legend = cleanText(element?.closest?.("fieldset")?.querySelector?.("legend")?.textContent);
    const contextualLabel = findContextualLabel(element?.closest?.("[data-block-id]") ?? element?.parentElement ?? element);
    const previousHeading = cleanText(element?.parentElement?.querySelector?.("h1,h2,h3,h4,h5,h6,label,legend")?.textContent);
    const placeholder = cleanText(element?.getAttribute?.("placeholder"));
    const stableFileLabel =
      inputType === "file" && dataUi ? dataUi.replace(/[_-]+/g, " ") : "";
    const stablePhoneLabel =
      inputType === "tel" && name ? name.replace(/[_-]+/g, " ") : "";
    const label =
      stableFileLabel ||
      labelFromFor ||
      checkboxOptionLabel ||
      immediateHeadingLabel ||
      ariaLabel ||
      stablePhoneLabel ||
      wrappingLabel ||
      legend ||
      contextualLabel ||
      previousHeading ||
      placeholder ||
      name ||
      \`\${tagName}-\${index + 1}\`;

    if (
      looksCookieOrConsentContainer(element) ||
      looksSearchField(element, label, placeholder) ||
      isAntiBotField(element)
    ) {
      return null;
    }

    if ((rawRole === "combobox" || rawClassName.includes("select__input")) && !id && !name) {
      return null;
    }

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

    const selectorHints = [
      id ? \`[id="\${id}"]\` : "",
      name ? \`[name="\${name}"]\` : "",
      dataUi ? \`[data-ui="\${dataUi}"]\` : "",
      ngModel ? \`[ng-model="\${ngModel}"]\` : "",
      ariaLabel ? \`[aria-label="\${ariaLabel}"]\` : "",
      placeholder ? \`[placeholder="\${placeholder}"]\` : "",
    ].filter(Boolean);

    return {
      key: name || ngModel || dataUi || id || \`\${tagName}-\${index + 1}\`,
      label,
      inputType,
      htmlTag: tagName || null,
      htmlInputType: inputType || null,
      rawRole: rawRole || null,
      required:
        Boolean(element?.hasAttribute?.("required")) ||
        cleanText(element?.getAttribute?.("aria-required")).toLowerCase() === "true" ||
        label.includes("*") ||
        cleanText(element?.closest?.("[aria-required='true']")?.textContent).length > 0,
      options,
      placeholder: placeholder || null,
      helpText: cleanText(element?.getAttribute?.("aria-description")) || null,
      accept: cleanText(element?.getAttribute?.("accept")) || null,
      selectorHints,
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
    if (element?.disabled || isAntiBotField(element) || isVisiblyHiddenField(element)) {
      return false;
    }
    return true;
  });
  const customFileFields = Array.from(
    doc?.querySelectorAll?.(
      ".file-input-container .button.resume, a.button.resume, button.button.resume, [ng-click*='showFileSelector']",
    ) ?? [],
  )
    .map((element, index) => {
      const label = cleanText(element?.textContent) || "Upload Resume";
      const required =
        cleanText(element?.closest?.(".file-input-container, .apply-button")?.textContent).includes("*") ||
        cleanText(element?.getAttribute?.("aria-label")).includes("*");
      return {
        key: cleanText(element?.getAttribute?.("name")) || \`custom-file-upload-\${index + 1}\`,
        label,
        inputType: "file",
        required,
        options: [],
        placeholder: null,
        helpText: null,
        accept: null,
        selectorHints: [
          ".file-input-container .button.resume",
          "a.button.resume",
          "button.button.resume",
          "[ng-click*='showFileSelector']",
        ],
      };
    });

  const uniqueFields = [...fieldNodes.map((element, index) => describeField(element, index)).filter(Boolean), ...customFileFields]
    .filter((field, index, all) => all.findIndex((candidate) => candidate.key === field.key) === index);

  const genericPrecursorLinks = Array.from(doc?.querySelectorAll?.("a[href], button") ?? [])
    .map((element) => {
      const text = cleanText(element?.textContent) || cleanText(element?.getAttribute?.("aria-label"));
      const tagName = String(element?.tagName ?? "").toLowerCase();
      const href = tagName === "a" ? cleanText(element?.href) : cleanText(element?.dataset?.href);
      return { label: text, href };
    })
    .filter((candidate) => candidate.label && applyTextPattern.test(candidate.label) && Boolean(candidate.href));
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

const EXTERNAL_EMBEDDED_APPLICATION_EVALUATE_SCRIPT = `(() => {
  const cleanText = (value) => String(value ?? "").replace(/\\s+/g, " ").trim();
  const currentUrl = cleanText(globalThis.location?.href);
  const scoreIframe = (iframe) => {
    const src = cleanText(iframe?.getAttribute?.("src"));
    const title = cleanText(iframe?.getAttribute?.("title")).toLowerCase();
    const id = cleanText(iframe?.getAttribute?.("id")).toLowerCase();
    const className = cleanText(iframe?.getAttribute?.("class")).toLowerCase();
    if (!src) {
      return null;
    }

    const lowerSrc = src.toLowerCase();
    if (
      /googletagmanager|google\\.com|youtube|vimeo|doubleclick|cookie|consent|intercom|hotjar|analytics|tracking|recaptcha|captcha/.test(lowerSrc)
    ) {
      return null;
    }

    let score = 0;
    if (/greenhouse\\.io\\/embed\\/job_app/.test(lowerSrc)) {
      score += 100;
    }
    if (/ashbyhq\\.com\\/.+\\/[0-9a-f-]{20,}/.test(lowerSrc)) {
      score += 90;
    }
    if (/in_iframe=1/.test(lowerSrc)) {
      score += 80;
    }
    if (/apply|application|job_app|embed=js|candidate/.test(lowerSrc)) {
      score += 40;
    }
    if (/job board|job application|application|careers/i.test(title)) {
      score += 30;
    }
    if (/apply|career|job|embed/.test(id) || /apply|career|job|embed/.test(className)) {
      score += 15;
    }
    if (currentUrl && lowerSrc.replace(/&amp;/g, "&").includes(currentUrl.toLowerCase().split("?")[0] ?? "")) {
      score += 10;
    }

    return score > 0
      ? {
          href: src,
          title: cleanText(iframe?.getAttribute?.("title")),
          id: cleanText(iframe?.getAttribute?.("id")),
          score,
        }
      : null;
  };

  return Array.from(globalThis.document?.querySelectorAll?.("iframe") ?? [])
    .map(scoreIframe)
    .filter(Boolean)
    .sort((left, right) => right.score - left.score);
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
  if (lower.includes("apply.workable.com")) {
    return "workable";
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

function mapAshbyFieldTypeToFieldType(inputType: string): ExternalApplicationFieldType {
  switch (inputType) {
    case "LongText":
      return "long_text";
    case "Number":
      return "number";
    case "Email":
      return "email";
    case "Phone":
      return "phone";
    case "File":
      return "file";
    case "Boolean":
      return "boolean";
    case "ValueSelect":
    case "Location":
      return "single_select";
    case "String":
    default:
      return "short_text";
  }
}

function escapePlaywrightText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildAshbySelectorHints(input: {
  key: string;
  label: string;
  type: ExternalApplicationFieldType;
  options: string[];
}): string[] {
  const key = escapePlaywrightText(input.key);
  const label = escapePlaywrightText(input.label);
  const scopedEntry = `.ashby-application-form-field-entry:has(.ashby-application-form-question-title:has-text("${label}"))`;
  const selectors = [
    `[id="${key}"]`,
    `[name="${key}"]`,
    `input[id*="${key}"]`,
    `textarea[id*="${key}"]`,
    `input[name$="_${key}"]`,
    `${scopedEntry} input`,
    `${scopedEntry} textarea`,
    `${scopedEntry} select`,
  ];

  if (input.type === "file") {
    selectors.unshift(`${scopedEntry} input[type="file"]`);
  }
  if (input.type === "single_select" && input.options.length > 0) {
    selectors.unshift(`${scopedEntry} input[type="radio"]`);
  }
  if (input.type === "single_select" && input.options.length === 0) {
    selectors.unshift(`${scopedEntry} [role="combobox"]`);
  }
  if (input.type === "boolean") {
    selectors.unshift(`${scopedEntry} input[type="checkbox"]`, `${scopedEntry} input[type="radio"]`);
  }

  return [...new Set(selectors)];
}

async function inspectAshbyApplicationFields(page: Page): Promise<ExternalApplicationField[]> {
  if (typeof (page as Page & { evaluate?: unknown }).evaluate !== "function") {
    return [];
  }

  /* c8 ignore start -- browser-context DOM traversal is exercised through Playwright, not node unit tests */
  const rawFields = await page.evaluate(() => {
    const doc = (globalThis as any).document;
    const cleanText = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
    const htmlToText = (html: unknown) => {
      const template = doc.createElement("template");
      template.innerHTML = String(html ?? "");
      return cleanText(template.content.textContent);
    };
    const fieldEntries = (globalThis as {
      __appData?: {
        posting?: {
          applicationForm?: {
            fieldEntries?: Array<{
              isRequired?: boolean;
              descriptionHtml?: string | null;
              field?: {
                path?: string;
                id?: string;
                title?: string;
                type?: string;
                selectableValues?: Array<{ label?: string; value?: string }>;
              };
            }>;
          };
        } | null;
      };
    }).__appData?.posting?.applicationForm?.fieldEntries;

    return Array.isArray(fieldEntries)
      ? fieldEntries
          .map((entry) => {
            const field = entry.field;
            const key = cleanText(field?.path || field?.id);
            const label = cleanText(field?.title || field?.path || field?.id);
            const inputType = cleanText(field?.type);
            if (!key || !label || !inputType) {
              return null;
            }
            return {
              key,
              label,
              inputType,
              required: entry.isRequired === true,
              options: (field?.selectableValues ?? [])
                .map((option) => cleanText(option.label || option.value))
                .filter(Boolean),
              placeholder: null,
              helpText: htmlToText(entry.descriptionHtml),
              accept: inputType === "File" ? "application/pdf,.pdf,.doc,.docx" : null,
            };
          })
          .filter(Boolean)
      : [];
  }).catch(() => []);
  /* c8 ignore stop */

  if (!Array.isArray(rawFields)) {
    return [];
  }

  return rawFields.map((field) => {
    const typedField = field as {
      key: string;
      label: string;
      inputType: string;
      required: boolean;
      options: string[];
      placeholder: string | null;
      helpText: string | null;
      accept: string | null;
    };
    const type = mapAshbyFieldTypeToFieldType(typedField.inputType);
    return {
      key: typedField.key,
      label: typedField.label,
      type,
      htmlInputType:
        typedField.inputType === "ValueSelect"
          ? "radio"
          : typedField.inputType === "Location"
            ? "select"
            : typedField.inputType.toLowerCase(),
      required: typedField.required,
      options: typedField.inputType === "Boolean" && typedField.options.length === 0
        ? ["Yes", "No"]
        : typedField.options,
      placeholder: typedField.placeholder,
      helpText: typedField.helpText || null,
      accept: typedField.accept,
      selectorHints: buildAshbySelectorHints({
        key: typedField.key,
        label: typedField.label,
        type,
        options: typedField.options,
      }),
    };
  });
}

function inferAuthWall(args: {
  finalUrl: string;
  pageTitle: string;
  fields: ExternalApplicationField[];
  precursorLinks: Array<{ label: string; href: string }>;
}): { authWall: boolean; authWallReason: string | null } {
  if (args.fields.length > 0 || args.precursorLinks.length > 0) {
    return {
      authWall: false,
      authWallReason: null,
    };
  }

  const combined = `${args.finalUrl} ${args.pageTitle}`.toLowerCase();
  if (
    /\/login\b|\/signin\b|\/sign-in\b|\/account\b/.test(combined) ||
    /\blogin\b|\blog in\b|\bsign in\b|\bsign-in\b|\bcreate account\b|\btalent community\b/.test(combined)
  ) {
    return {
      authWall: true,
      authWallReason:
        "The external site appears to require login or account access before the application form is visible.",
    };
  }

  return {
    authWall: false,
    authWallReason: null,
  };
}

function looksNonApplicationField(field: {
  key: string;
  label: string;
  placeholder: string | null;
  selectorHints?: string[] | undefined;
}): boolean {
  const combined = [
    field.key,
    field.label,
    field.placeholder,
    ...(field.selectorHints ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/cybot|cookiebot|cookiedialog|privacy-banner/.test(combined)) {
    return true;
  }

  return /\bsearch\b|\bzoeken\b|zoekterm|recaptcha|g-recaptcha|hcaptcha|turnstile|captcha/.test(combined);
}

// Opens an external apply URL and returns the normalized discovery model used by the rest of the flow.
export async function discoverExternalApplication(
  page: Page,
  sourceUrl: string,
  retryPolicy: ExternalDiscoveryRetryPolicy = DEFAULT_EXTERNAL_DISCOVERY_RETRY_POLICY,
): Promise<ExternalApplicationDiscovery> {
  await safePageGoto(
    page,
    sourceUrl,
    undefined,
    externalNavigationOptions(retryPolicy, "External application source"),
  );
  await waitForExternalDiscoverySignals(page, retryPolicy);
  return inspectExternalApplicationPageWithRetry(page, sourceUrl, retryPolicy);
}

async function waitForExternalDiscoverySignals(
  page: Page,
  retryPolicy: ExternalDiscoveryRetryPolicy = DEFAULT_EXTERNAL_DISCOVERY_RETRY_POLICY,
): Promise<void> {
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
    "iframe",
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
            /\\b(apply|continue|start|next|begin)\\b|başvur|basvur|devam|ileri|sonraki|başla|basla/.test(text) ||
            /\\b(apply|continue|start|next|begin)\\b|başvur|basvur|devam|ileri|sonraki|başla|basla/.test(ariaLabel)
          );
        });
      }`,
      discoverySignal,
      { timeout: retryPolicy.signalTimeoutMs },
    )
    .catch(() => undefined);
}

async function inspectEmbeddedApplicationCandidates(page: Page): Promise<Array<{ href: string; score: number }>> {
  let domCandidates: Array<{ href: string; score: number }> = [];
  try {
    const embedValue = await page.evaluate(EXTERNAL_EMBEDDED_APPLICATION_EVALUATE_SCRIPT) as Array<{
      href?: string;
      score?: number;
    }> | null;
    domCandidates = Array.isArray(embedValue)
      ? embedValue
          .map((candidate) => ({
            href: typeof candidate?.href === "string" ? candidate.href.trim() : "",
            score: typeof candidate?.score === "number" ? candidate.score : 0,
          }))
          .filter((candidate) => candidate.href.length > 0)
      : [];
  } catch {
    // Fall through to raw HTML parsing below when DOM evaluation is unavailable or incomplete.
  }

  if (domCandidates.length > 0) {
    return domCandidates;
  }

  if (typeof (page as Page & { content?: unknown }).content !== "function") {
    return [];
  }

  try {
    const html = await page.content();
    const matches = [...html.matchAll(/<iframe[^>]+src=["']([^"']+)["']/gi)];
    return matches
      .map((match) => match[1]?.replace(/&amp;/g, "&").trim() ?? "")
      .filter((href) =>
        /greenhouse\.io\/embed\/job_app|ashbyhq\.com\/.+\/[0-9a-f-]{20,}|in_iframe=1|apply|application|job_app|embed=js/i.test(
          href,
        ),
      )
      .map((href) => ({
        href,
        score: /in_iframe=1/i.test(href) ? 85 : 50,
      }));
  } catch {
    return [];
  }
}

// Re-inspects the current page without changing navigation, mainly after Next/Submit actions.
export async function inspectExternalApplicationPage(
  page: Page,
  sourceUrl: string,
): Promise<ExternalApplicationDiscovery> {
  const cookiePromptAcceptances = await acceptAllCookiePrompts(page).catch(() => []);
  /* c8 ignore start -- browser-context DOM traversal is exercised through Playwright, not node unit tests */
  const inspectedRaw = await page.evaluate(EXTERNAL_DISCOVERY_EVALUATE_SCRIPT) as {
    url: string;
    title: string;
    precursorPage?: boolean;
    precursorSignals?: string[];
    fields: Array<{
      key: string;
      label: string;
      inputType: string;
      htmlTag?: string | null;
      htmlInputType?: string | null;
      rawRole?: string | null;
      required: boolean;
      options: string[];
      placeholder: string | null;
      helpText: string | null;
      accept: string | null;
      selectorHints?: string[];
    }>;
    precursorLinks: Array<{ label: string; href: string }>;
  };
  const inspected =
    inspectedRaw &&
    typeof inspectedRaw === "object" &&
    Array.isArray((inspectedRaw as { fields?: unknown }).fields) &&
    Array.isArray((inspectedRaw as { precursorLinks?: unknown }).precursorLinks)
      ? inspectedRaw
      : {
          url: sourceUrl,
          title: "",
          authWall: false,
          authWallReason: null,
          precursorPage: false,
          precursorSignals: [],
          fields: [],
          precursorLinks: [],
        };
  /* c8 ignore stop */

  const shouldPreferAshbyFields =
    inferPlatform(inspected.url) === "ashby" && /\/application(?:[/?#]|$)/i.test(inspected.url);
  const ashbyFields = shouldPreferAshbyFields
    ? await inspectAshbyApplicationFields(page)
    : [];
  const normalizedFields: ExternalApplicationField[] = (ashbyFields.length > 0 ? ashbyFields : inspected.fields.map((field) => ({
    key: field.key,
    label: field.label,
    type: mapHtmlInputTypeToFieldType(field.inputType, field.options),
    ...(field.htmlTag ? { htmlTag: field.htmlTag } : {}),
    ...(field.htmlInputType ? { htmlInputType: field.htmlInputType } : {}),
    ...(field.rawRole ? { rawRole: field.rawRole } : {}),
    required: field.required,
    options: field.options,
    placeholder: field.placeholder,
    helpText: field.helpText,
    accept: field.accept,
    selectorHints: field.selectorHints,
  })));
  const fields = annotateSemanticFieldsWithPlatform(normalizedFields).filter((field, _, allFields) => {
    if (looksNonApplicationField(field)) {
      return false;
    }

    const isShadowInputDuplicate =
      /^input-\d+$/i.test(field.key) &&
      (field.selectorHints?.length ?? 0) === 0 &&
      allFields.some((candidate) => {
        if (candidate === field) {
          return false;
        }

        const sameLabel =
          candidate.label.replace(/\*/g, "").trim().toLowerCase() ===
          field.label.replace(/\*/g, "").trim().toLowerCase();
        const candidateHasRealSelector = (candidate.selectorHints?.length ?? 0) > 0;
        const candidateLooksCanonical = !/^input-\d+$/i.test(candidate.key);
        return sameLabel && candidateHasRealSelector && candidateLooksCanonical;
      });
    if (isShadowInputDuplicate) {
      return false;
    }

    const genericLabel =
      field.label.trim().toLowerCase() === "please fill out the following information.";
    if (!genericLabel) {
      return true;
    }

    const normalizedKey = field.key.trim().toLowerCase();
    return !allFields.some(
      (candidate) =>
        candidate !== field &&
        (candidate.label.trim().toLowerCase() === normalizedKey ||
          candidate.key.trim().toLowerCase() === normalizedKey),
    );
  });
  const authWall = inferAuthWall({
    finalUrl: inspected.url,
    pageTitle: inspected.title,
    fields,
    precursorLinks: inspected.precursorLinks,
  });

  return {
    sourceUrl,
    finalUrl: inspected.url,
    pageTitle: inspected.title,
    platform: inferPlatform(inspected.url),
    fields,
    authWall: authWall.authWall,
    authWallReason: authWall.authWallReason,
    precursorPage: inspected.precursorPage === true,
    precursorSignals: inspected.precursorSignals ?? [],
    precursorLinks: inspected.precursorLinks,
    followedPrecursorLink: null,
    cookiePromptAcceptances,
  };
}

async function inspectExternalApplicationPageWithRetry(
  page: Page,
  sourceUrl: string,
  retryPolicy: ExternalDiscoveryRetryPolicy = DEFAULT_EXTERNAL_DISCOVERY_RETRY_POLICY,
): Promise<ExternalApplicationDiscovery> {
  let inspection = await inspectExternalApplicationPage(page, sourceUrl);
  if (
    inspection.fields.length > 0 ||
    (inspection.platform === "workable" && /[?&]not_found=true(?:&|$)/i.test(inspection.finalUrl))
  ) {
    return inspection;
  }

  let embeddedApplicationCandidates = await inspectEmbeddedApplicationCandidates(page);

  for (const candidate of embeddedApplicationCandidates) {
    const candidateUrl = await tryNavigateToExternalCandidate(
      page,
      candidate.href,
      getExternalPageUrl(page, sourceUrl),
      retryPolicy,
      "Embedded application URL",
    );
    if (!candidateUrl) {
      continue;
    }
    await waitForExternalDiscoverySignals(page, retryPolicy);
    inspection = await inspectExternalApplicationPage(page, sourceUrl);
    if (inspection.fields.length > 0 || inspection.precursorLinks.length > 0) {
      return {
        ...inspection,
        followedPrecursorLink: candidateUrl,
      };
    }
  }

  if (inspection.precursorLinks.length > 0) {
    return inspection;
  }

  const waitForTimeout = (page as Page & { waitForTimeout?: unknown }).waitForTimeout;
  if (typeof waitForTimeout !== "function") {
    return inspection;
  }

  for (const delayMs of retryPolicy.delayedEmbedRetryDelaysMs) {
    await page.waitForTimeout(delayMs);
    embeddedApplicationCandidates = await inspectEmbeddedApplicationCandidates(page);
    for (const candidate of embeddedApplicationCandidates) {
      const candidateUrl = await tryNavigateToExternalCandidate(
        page,
        candidate.href,
        getExternalPageUrl(page, sourceUrl),
        retryPolicy,
        "Delayed embedded application URL",
      );
      if (!candidateUrl) {
        continue;
      }
      await waitForExternalDiscoverySignals(page, retryPolicy);
      inspection = await inspectExternalApplicationPage(page, sourceUrl);
      if (inspection.fields.length > 0 || inspection.precursorLinks.length > 0) {
        return {
          ...inspection,
          followedPrecursorLink: candidateUrl,
        };
      }
    }
    inspection = await inspectExternalApplicationPage(page, sourceUrl);
    if (inspection.fields.length > 0 || inspection.precursorLinks.length > 0) {
      return inspection;
    }
  }

  return inspection;
}

// Extracts cleaned page text so planners and diagnostics can work on a stable text snapshot.
export async function extractExternalPageText(page: Page): Promise<string> {
  try {
    return String(await page.evaluate(EXTERNAL_PAGE_TEXT_EVALUATE_SCRIPT));
  } catch {
    return "";
  }
}

// Follows an intermediate precursor/apply link and returns a fresh discovery result from the new page.
export async function followExternalApplicationLink(
  page: Page,
  sourceUrl: string,
  href: string,
  retryPolicy: ExternalDiscoveryRetryPolicy = DEFAULT_EXTERNAL_DISCOVERY_RETRY_POLICY,
): Promise<ExternalApplicationDiscovery> {
  const resolvedHref = resolveExternalNavigationCandidate(
    href,
    getExternalPageUrl(page, sourceUrl),
    retryPolicy,
  );
  await safePageGoto(
    page,
    resolvedHref,
    undefined,
    externalNavigationOptions(retryPolicy, "External application precursor URL"),
  );
  await waitForExternalDiscoverySignals(page, retryPolicy);
  const discovered = await inspectExternalApplicationPageWithRetry(page, sourceUrl, retryPolicy);
  return {
    ...discovered,
    followedPrecursorLink: resolvedHref,
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

// Produces a field-by-field answer plan using semantic resolution first and generic strategies second.
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

    const semanticAnswer = resolveSemanticExternalAnswerWithPlatform({
      field,
      candidateProfile: input.candidateProfile,
      ...(input.pageContext !== undefined ? { pageContext: input.pageContext } : {}),
    });
    if (semanticAnswer) {
      plans.push({
        fieldKey: field.key,
        fieldLabel: field.label,
        fieldType: field.type,
        ...(field.semanticKey ? { semanticKey: field.semanticKey } : {}),
        question,
        answer: semanticAnswer.answer,
        source: semanticAnswer.source,
        confidenceLabel: semanticAnswer.confidenceLabel,
        ...(semanticAnswer.resolutionStrategy
          ? { resolutionStrategy: semanticAnswer.resolutionStrategy }
          : {}),
        ...(semanticAnswer.notes ? { notes: semanticAnswer.notes } : {}),
      });
      continue;
    }

    if (looksSyntheticFieldLabel(field)) {
      plans.push({
        fieldKey: field.key,
        fieldLabel: field.label,
        fieldType: field.type,
        ...(field.semanticKey ? { semanticKey: field.semanticKey } : {}),
        question,
        answer: null,
        source: "manual",
        confidenceLabel: "manual_review",
        resolutionStrategy: "heuristic:synthetic-label-skip",
        notes: "Skipped because the field label looks synthetic or trap-like.",
      });
      continue;
    }

    if (field.type === "file") {
      plans.push({
        fieldKey: field.key,
        fieldLabel: field.label,
        fieldType: field.type,
        ...(field.semanticKey ? { semanticKey: field.semanticKey } : {}),
        question,
        answer: input.candidateProfile.sourceMetadata.resumePath ?? null,
        source: "candidate-profile",
        confidenceLabel: input.candidateProfile.sourceMetadata.resumePath ? "high" : "manual_review",
        resolutionStrategy: "candidate-profile:resume-upload",
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
      ...(field.semanticKey ? { semanticKey: field.semanticKey } : {}),
      question,
      answer: normalizedAnswer,
      source: resolved.source,
      confidenceLabel: resolved.confidenceLabel,
      resolutionStrategy: "llm-or-default-answer-resolution",
      ...(resolved.notes
        ? {
            notes: Array.isArray(resolved.notes) ? resolved.notes.join(" ") : String(resolved.notes),
          }
        : {}),
    });
  }

  return plans;
}
