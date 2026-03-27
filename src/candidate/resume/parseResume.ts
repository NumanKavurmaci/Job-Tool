import { z } from "zod";
import { completePrompt } from "../../llm/completePrompt.js";
import { parseJsonResponse } from "../../llm/json.js";
import type { ParsedResume } from "../types.js";

const nullableArray = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value == null ? [] : value), z.array(schema).default([]));

const ResumeSchema = z.object({
  fullName: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  location: z.string().nullable(),
  githubUrl: z.string().nullable(),
  portfolioUrl: z.string().nullable(),
  summary: z.string().nullable(),
  currentTitle: z.string().nullable(),
  skills: nullableArray(z.string()),
  languages: nullableArray(z.string()),
  workAuthorization: z.string().nullable(),
  requiresSponsorship: z.boolean().nullable(),
  willingToRelocate: z.boolean().nullable(),
  remotePreference: z.string().nullable(),
  education: nullableArray(
    z.object({
      institution: z.string(),
      degree: z.string().nullable(),
      fieldOfStudy: z.string().nullable(),
      startDate: z.string().nullable(),
      endDate: z.string().nullable(),
    }),
  ),
  experience: nullableArray(
    z.object({
      company: z.string(),
      title: z.string(),
      summary: z.string().nullable(),
      technologies: nullableArray(z.string()),
      startDate: z.string().nullable(),
      endDate: z.string().nullable(),
    }),
  ),
  projects: nullableArray(
    z.object({
      name: z.string(),
      summary: z.string().nullable(),
      technologies: nullableArray(z.string()),
    }),
  ),
  yearsOfExperienceTotal: z.number().nullable(),
});

export async function parseResume(resumeText: string): Promise<ParsedResume> {
  const prompt = `
Extract the resume into valid JSON only.

Rules:
- Return only JSON
- Use null when unknown
- Do not invent experience, skills, or contact details
- Arrays must always be arrays
- yearsOfExperienceTotal must be a number or null

Schema:
{
  "fullName": string | null,
  "email": string | null,
  "phone": string | null,
  "location": string | null,
  "githubUrl": string | null,
  "portfolioUrl": string | null,
  "summary": string | null,
  "currentTitle": string | null,
  "skills": string[],
  "languages": string[],
  "workAuthorization": string | null,
  "requiresSponsorship": boolean | null,
  "willingToRelocate": boolean | null,
  "remotePreference": string | null,
  "education": [
    {
      "institution": string,
      "degree": string | null,
      "fieldOfStudy": string | null,
      "startDate": string | null,
      "endDate": string | null
    }
  ],
  "experience": [
    {
      "company": string,
      "title": string,
      "summary": string | null,
      "technologies": string[],
      "startDate": string | null,
      "endDate": string | null
    }
  ],
  "projects": [
    {
      "name": string,
      "summary": string | null,
      "technologies": string[]
    }
  ],
  "yearsOfExperienceTotal": number | null
}

Resume:
"""${resumeText.slice(0, 15000)}"""
`.trim();

  const response = await completePrompt(prompt);

  let parsedJson: unknown;
  try {
    parsedJson = parseJsonResponse(response.text);
  } catch (error) {
    throw new Error("Resume parser returned invalid JSON.", { cause: error });
  }

  return ResumeSchema.parse(parsedJson);
}
