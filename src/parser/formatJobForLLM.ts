import type { ExtractedJobContent } from "../adapters/types.js";

export function section(label: string, value: string | null | undefined): string {
  return `${label}:\n${value?.trim() ? value.trim() : "N/A"}`;
}

export type FormatJobForLLMOptions = {
  omitLocation?: boolean;
};

export function formatJobForLLM(
  job: ExtractedJobContent,
  options: FormatJobForLLMOptions = {},
): string {
  return [
    `Title: ${job.title ?? "N/A"}`,
    `Company: ${job.company ?? "N/A"}`,
    ...(options.omitLocation ? [] : [`Location: ${job.location ?? "N/A"}`]),
    `Platform: ${job.platform}`,
    `Application Type: ${job.applicationType}`,
    `Apply URL: ${job.applyUrl ?? "N/A"}`,
    `Current URL: ${job.currentUrl}`,
    "",
    section("Requirements", job.requirementsText),
    "",
    section("Benefits", job.benefitsText),
    "",
    section("Description", job.descriptionText ?? job.rawText),
  ].join("\n");
}
