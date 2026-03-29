import type { CandidateProfile } from "../candidate/types.js";
import { completePrompt } from "../llm/completePrompt.js";

function truncate(value: string | null | undefined, max: number): string {
  const normalized = value?.trim() ?? "";
  if (!normalized) {
    return "Unknown";
  }

  return normalized.length <= max ? normalized : `${normalized.slice(0, max)}...`;
}

export async function generateCoverLetter(input: {
  candidateProfile: CandidateProfile;
  targetJobContext?: {
    title: string | null;
    company: string | null;
    location: string | null;
  };
  pageContextText?: string | null;
  maxCharacters?: number;
}): Promise<{ text: string; confidence: number; notes?: string[] }> {
  const maxCharacters = input.maxCharacters ?? 1400;
  const prompt = `
Write a concise job-application cover letter in first person singular.

Rules:
- Plain text only
- Keep it professional, warm, and specific to the visible job page
- Use only candidate profile/resume evidence and visible page information
- Do not invent employers, technologies, years, or achievements not supported by the evidence
- Do not include placeholders
- Keep it under ${maxCharacters} characters
- 2 to 4 short paragraphs are fine

Candidate profile:
Name: ${input.candidateProfile.fullName ?? "Unknown"}
Current title: ${input.candidateProfile.currentTitle ?? "Unknown"}
Location: ${input.candidateProfile.location ?? "Unknown"}
Summary: ${truncate(input.candidateProfile.summary, 800)}
Skills: ${input.candidateProfile.skills.join(", ") || "None listed"}
Preferred tech stack: ${input.candidateProfile.preferredTechStack.join(", ") || "None listed"}
Experience highlights:
${input.candidateProfile.experience
  .slice(0, 5)
  .map((item) => `- ${item.title} at ${item.company}: ${item.summary ?? "No summary"} (${item.technologies.join(", ")})`)
  .join("\n") || "- None listed"}

Target job:
Title: ${input.targetJobContext?.title ?? "Unknown"}
Company: ${input.targetJobContext?.company ?? "Unknown"}
Location: ${input.targetJobContext?.location ?? "Unknown"}

Visible page context:
${truncate(input.pageContextText, 6000)}
`.trim();

  const response = await completePrompt(prompt);
  const text = response.text.trim().slice(0, maxCharacters);

  return {
    text,
    confidence: 0.68,
    notes: ["Generated from candidate profile, resume evidence, and visible external page context."],
  };
}
