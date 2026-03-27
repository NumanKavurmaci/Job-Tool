export function buildParseJobPrompt(formattedJobText: string): string {
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
- Prefer explicitly labeled fields over weak guesses

Schema:
{
  "title": string | null,
  "company": string | null,
  "location": string | null,
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
