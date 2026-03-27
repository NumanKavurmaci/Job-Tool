import type { CandidateProfile } from "../candidate/types.js";
import { completePrompt } from "../llm/completePrompt.js";

export async function generateShortAnswer(input: {
  question: string;
  candidateProfile: CandidateProfile;
  targetJobContext?: {
    title: string | null;
    company: string | null;
    location: string | null;
  };
  maxCharacters?: number;
}): Promise<{ text: string; confidence: number; notes?: string[] }> {
  const maxCharacters = input.maxCharacters ?? 280;
  const prompt = `
Answer the application question in first person singular.

Rules:
- Keep it concise
- Do not invent anything not supported by the candidate profile
- Do not exaggerate
- Stay under ${maxCharacters} characters
- Plain text only

Question:
${input.question}

Candidate summary:
Name: ${input.candidateProfile.fullName ?? "Unknown"}
Current title: ${input.candidateProfile.currentTitle ?? "Unknown"}
Summary: ${input.candidateProfile.summary ?? "Unknown"}
Skills: ${input.candidateProfile.skills.join(", ")}
Experience:
${input.candidateProfile.experience
  .slice(0, 5)
  .map((item) => `- ${item.title} at ${item.company}: ${item.summary ?? "No summary"} (${item.technologies.join(", ")})`)
  .join("\n")}

Target job:
Title: ${input.targetJobContext?.title ?? "Unknown"}
Company: ${input.targetJobContext?.company ?? "Unknown"}
Location: ${input.targetJobContext?.location ?? "Unknown"}
`.trim();

  const response = await completePrompt(prompt);
  const text = response.text.trim().slice(0, maxCharacters);

  return {
    text,
    confidence: 0.62,
    notes: ["Generated from resume/profile context. Review before submitting."],
  };
}
