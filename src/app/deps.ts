import type { Page } from "@playwright/test";
import { resolveAnswer } from "../answers/resolveAnswer.js";
import { withPage } from "../browser/playwright.js";
import { loadCandidateMasterProfile } from "../candidate/loadCandidateProfile.js";
import { prisma } from "../db/client.js";
import { normalizeParsedJob } from "../domain/job.js";
import {
  runEasyApply,
  runEasyApplyBatch,
  runEasyApplyBatchDryRun,
  runEasyApplyDryRun,
} from "../linkedin/easyApply.js";
import { parseJob } from "../llm/parseJob.js";
import { completePrompt } from "../llm/completePrompt.js";
import { getConfiguredProviderInfo } from "../llm/providers/resolveProvider.js";
import { extractJobText } from "../parser/extractJobText.js";
import { formatJobForLLM } from "../parser/formatJobForLLM.js";
import { evaluatePolicy } from "../policy/policyEngine.js";
import { loadCandidateProfile } from "../profile/candidate.js";
import { decideJob } from "../scoring/decision.js";
import { scoreJob } from "../scoring/scoreJob.js";
import { scoreJobWithAi } from "../scoring/scoreJobWithAi.js";
import { logger } from "../utils/logger.js";
import { writeRunReport } from "../utils/runReports.js";

export const appDeps = {
  withPage,
  prisma,
  loadCandidateMasterProfile,
  resolveAnswer,
  extractJobText,
  formatJobForLLM,
  parseJob,
  completePrompt,
  getConfiguredProviderInfo,
  normalizeParsedJob,
  loadCandidateProfile,
  scoreJob,
  scoreJobWithAi,
  evaluatePolicy,
  decideJob,
  runEasyApplyDryRun,
  runEasyApply,
  runEasyApplyBatch,
  runEasyApplyBatchDryRun,
  createEasyApplyDriver: async (page: unknown) => {
    const { PlaywrightLinkedInEasyApplyDriver } =
      await import("../linkedin/playwrightEasyApplyDriver.js");
    return new PlaywrightLinkedInEasyApplyDriver(page as Page);
  },
  writeRunReport,
  logger,
  exit: (code: number) => process.exit(code),
};

export type AppDeps = typeof appDeps;
