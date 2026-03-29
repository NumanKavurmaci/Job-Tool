import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
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
  const userDir = path.join(process.cwd(), "user");
  const candidates = existsSync(userDir)
    ? readdirSync(userDir)
        .filter((entry) => /\.(pdf|docx|md|txt)$/i.test(entry))
        .sort()
        .map((entry) => path.join("user", entry))
    : [];

  if (candidates.length > 0) {
    return candidates[0];
  }

  const rootMatch = readdirSync(process.cwd()).find((entry) =>
    /\.(pdf|docx|md|txt)$/i.test(entry),
  );
  return rootMatch;
}

export const DEFAULT_RESUME_PATH = findDefaultResumePath();
