import { z } from "zod";
import { openai } from "../llm/client.js";

export const ParsedJobSchema = z.object({
  title: z.string().nullable(),
  company: z.string().nullable(),
  location: z.string().nullable(),
  platform: z.string().nullable(),
  seniority: z.string().nullable(),
  mustHaveSkills: z.array(z.string()).default([]),
  niceToHaveSkills: z.array(z.string()).default([]),
  technologies: z.array(z.string()).default([]),
  yearsRequired: z.number().nullable(),
  remoteType: z.string().nullable(),
  visaSponsorship: z.enum(["yes", "no"]).nullable(),
  workAuthorization: z
    .enum(["authorized", "requires-sponsorship", "unknown"])
    .nullable(),
});

export type ParsedJob = z.infer<typeof ParsedJobSchema>;

export async function parseJobWithLLM(jobText: string): Promise<ParsedJob> {
  const prompt = `
Extract the job posting into JSON.

Rules:
- Return only valid JSON
- Use null when unknown
- mustHaveSkills and niceToHaveSkills must be arrays
- technologies must be an array
- yearsRequired must be a number or null
- Prefer the explicitly labeled fields over inferring from unrelated text

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
"""${jobText.slice(0, 12000)}"""
`;

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: prompt,
  });

  const outputText = response.output_text;
  const parsed = JSON.parse(outputText);
  return ParsedJobSchema.parse(parsed);
}
