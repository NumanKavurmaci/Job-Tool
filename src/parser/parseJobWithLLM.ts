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
  remoteType: z.string().nullable(),
});

export type ParsedJob = z.infer<typeof ParsedJobSchema>;

export async function parseJobWithLLM(rawText: string): Promise<ParsedJob> {
  const prompt = `
Extract the job posting into JSON.

Rules:
- Return only valid JSON
- Use null when unknown
- mustHaveSkills and niceToHaveSkills must be arrays

Schema:
{
  "title": string | null,
  "company": string | null,
  "location": string | null,
  "platform": string | null,
  "seniority": string | null,
  "mustHaveSkills": string[],
  "niceToHaveSkills": string[],
  "remoteType": string | null
}

Job posting text:
"""${rawText.slice(0, 12000)}"""
`;

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: prompt,
  });

  const outputText = response.output_text;
  const parsed = JSON.parse(outputText);
  return ParsedJobSchema.parse(parsed);
}
