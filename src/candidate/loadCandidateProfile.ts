import { buildMasterProfile } from "./buildMasterProfile.js";
import type { CandidateProfile } from "./types.js";

export async function loadCandidateMasterProfile(input: {
  resumePath: string;
  linkedinUrl?: string;
}): Promise<CandidateProfile> {
  return buildMasterProfile(input);
}
