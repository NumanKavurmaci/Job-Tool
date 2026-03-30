export type BuildParseJobPromptOptions = {
  excludeLocation?: boolean;
};

export function buildParseJobPrompt(
  formattedJobText: string,
  options: BuildParseJobPromptOptions = {},
): string {
  const locationRule = options.excludeLocation
    ? '- Do not infer or return location when adapter metadata already provided it; set "location" to null'
    : "- Prefer explicitly labeled fields over weak guesses";

  const locationSchemaLine = options.excludeLocation
    ? '  "location": null,'
    : '  "location": string | null,';

  return `
Extract the job posting into JSON.

Rules:
- Return only valid JSON
- Do not wrap the response in markdown
- Do not add explanations, notes, or extra text
- Use null when unknown
- mustHaveSkills, niceToHaveSkills, and technologies must be arrays
- yearsRequired must be a number or null
- visaSponsorship must be "yes", "no", or null
- workAuthorization must be "authorized", "requires-sponsorship", "unknown", or null
${locationRule}

Schema:
{
  "title": string | null,
  "company": string | null,
${locationSchemaLine}
  "platform": string | null,
  "seniority": string | null,
  "mustHaveSkills": string[],
  "niceToHaveSkills": string[],
  "technologies": string[],
  "yearsRequired": number | null,
  "remoteType": string | null,
  "visaSponsorship": "yes" | "no" | null,
  "workAuthorization": "authorized" | "requires-sponsorship" | "unknown" | null
}

Job posting text:
"""${formattedJobText.slice(0, 12000)}"""
`.trim();
}
