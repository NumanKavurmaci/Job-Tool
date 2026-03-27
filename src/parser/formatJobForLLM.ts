import type { ExtractedJobContent } from "../adapters/types.js";

function section(label: string, value: string | null | undefined): string {
  return `${label}:\n${value?.trim() ? value.trim() : "N/A"}`;
}

export function formatJobForLLM(job: ExtractedJobContent): string {
  return [
    `Title: ${job.title ?? "N/A"}`,
    `Company: ${job.company ?? "N/A"}`,
    `Location: ${job.location ?? "N/A"}`,
    `Platform: ${job.platform}`,
    `Apply URL: ${job.applyUrl ?? "N/A"}`,
    `Current URL: ${job.currentUrl}`,
    "",
    section("Description", job.descriptionText ?? job.rawText),
    "",
    section("Requirements", job.requirementsText),
    "",
    section("Benefits", job.benefitsText),
  ].join("\n");
}
