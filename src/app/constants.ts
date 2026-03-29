import { readdirSync } from "node:fs";
import { env } from "../config/env.js";

export const PARSE_VERSION = "phase-5";
export const DEFAULT_LINKEDIN_EASY_APPLY_URL =
  "https://www.linkedin.com/jobs/collections/easy-apply";

export const LINKEDIN_BROWSER_SESSION_OPTIONS = {
  persistentProfilePath: env.LINKEDIN_BROWSER_PROFILE_PATH,
  storageStatePath: env.LINKEDIN_SESSION_STATE_PATH,
  persistStorageState: true,
} as const;

export const LINKEDIN_EVALUATION_SESSION_OPTIONS = {
  storageStatePath: env.LINKEDIN_SESSION_STATE_PATH,
  persistStorageState: true,
} as const;

export function isLinkedInCollectionUrl(url: string): boolean {
  return /linkedin\.com\/jobs\/collections\//i.test(url);
}

function findDefaultResumePath(): string | undefined {
  const match = readdirSync(process.cwd()).find((entry) =>
    /CV Resume\.pdf$/i.test(entry),
  );
  return match;
}

export const DEFAULT_RESUME_PATH = findDefaultResumePath();
