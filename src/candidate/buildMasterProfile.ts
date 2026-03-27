import { normalizeLinkedinUrl } from "./linkedin.js";
import { extractResumeText } from "./resume/extractResumeText.js";
import { normalizeResume } from "./resume/normalizeResume.js";
import { parseResume } from "./resume/parseResume.js";
import type { CandidateProfile } from "./types.js";

export async function buildMasterProfile(input: {
  resumePath: string;
  linkedinUrl?: string;
}): Promise<CandidateProfile> {
  const linkedinUrl = normalizeLinkedinUrl(input.linkedinUrl);
  const resumeText = await extractResumeText(input.resumePath);
  const parsed = await parseResume(resumeText);

  return normalizeResume(parsed, resumeText, {
    resumePath: input.resumePath,
    ...(linkedinUrl ? { linkedinUrl } : {}),
  });
}
