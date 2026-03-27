import { performance } from "node:perf_hooks";
import { withPage } from "./browser/playwright.js";
import { prisma } from "./db/client.js";
import { normalizeParsedJob } from "./domain/job.js";
import { parseJob } from "./llm/parseJob.js";
import { getConfiguredProviderInfo } from "./llm/providers/resolveProvider.js";
import { extractJobText } from "./parser/extractJobText.js";
import { formatJobForLLM } from "./parser/formatJobForLLM.js";
import { evaluatePolicy } from "./policy/policyEngine.js";
import { loadCandidateProfile } from "./profile/candidate.js";
import { decideJob } from "./scoring/decision.js";
import { scoreJob } from "./scoring/scoreJob.js";
import { logger } from "./utils/logger.js";

export const PARSE_VERSION = "phase-3";

export const appDeps = {
  withPage,
  prisma,
  extractJobText,
  formatJobForLLM,
  parseJob,
  getConfiguredProviderInfo,
  normalizeParsedJob,
  loadCandidateProfile,
  scoreJob,
  evaluatePolicy,
  decideJob,
  logger,
  exit: (code: number) => process.exit(code),
};

export function parseCliArgs(args = process.argv.slice(2)): {
  mode: "score" | "decide";
  url: string;
} {
  const [first, second] = args;

  if (!first) {
    throw new Error(
      'Usage: npm run dev -- <job-url> | npm run dev -- score "<job-url>" | npm run dev -- decide "<job-url>"',
    );
  }

  if ((first === "score" || first === "decide") && second) {
    return {
      mode: first,
      url: second,
    };
  }

  return {
    mode: "decide",
    url: first,
  };
}

export async function main(
  cliArgs = process.argv.slice(2),
  deps = appDeps,
) {
  const startedAt = performance.now();
  const { mode, url } = Array.isArray(cliArgs)
    ? parseCliArgs(cliArgs)
    : parseCliArgs([cliArgs]);
  const llmProviderInfo = deps.getConfiguredProviderInfo();

  deps.logger.info(
    {
      provider: llmProviderInfo.provider,
      model: llmProviderInfo.model,
    },
    `Using LLM provider: ${llmProviderInfo.provider} (${llmProviderInfo.model})`,
  );
  deps.logger.info({ url }, "Starting job fetch");
  const profile = await deps.loadCandidateProfile();

  const extracted = await deps.withPage(async (page) => {
    return deps.extractJobText(page, url);
  });

  deps.logger.info(
    {
      adapterPlatform: extracted.platform,
      rawTextLength: extracted.rawText.length,
      title: extracted.title,
      company: extracted.company,
      location: extracted.location,
    },
    "Job content extracted",
  );

  const llmInput = deps.formatJobForLLM(extracted);
  const parseResult = await deps.parseJob(llmInput);
  const parsed = parseResult.parsed;
  const normalized = deps.normalizeParsedJob(parsed, extracted);
  const score = deps.scoreJob(normalized, profile);
  const policy = deps.evaluatePolicy(normalized, profile);
  const decision = deps.decideJob(score);
  const finalDecision = policy.allowed ? decision.decision : "SKIP";
  const finalReasons = policy.allowed ? [decision.reason] : policy.reasons;

  deps.logger.info(
    {
      parsed,
      normalized,
      provider: parseResult.provider,
      model: parseResult.model,
    },
    "Job parsed and normalized",
  );
  deps.logger.info({ breakdown: score.breakdown, totalScore: score.totalScore }, "Job scored");
  deps.logger.info(
    { policyAllowed: policy.allowed, policyReasons: policy.reasons },
    "Policy evaluated",
  );

  const saved = await deps.prisma.jobPosting.upsert({
    where: { url },
    update: {
      rawText: extracted.rawText,
      title: parsed.title ?? extracted.title,
      company: parsed.company ?? extracted.company,
      location: parsed.location ?? extracted.location,
      platform: parsed.platform ?? extracted.platform,
      parsedJson: JSON.stringify(parsed),
      normalizedJson: JSON.stringify(normalized),
      parseVersion: PARSE_VERSION,
    },
    create: {
      url,
      rawText: extracted.rawText,
      title: parsed.title ?? extracted.title,
      company: parsed.company ?? extracted.company,
      location: parsed.location ?? extracted.location,
      platform: parsed.platform ?? extracted.platform,
      parsedJson: JSON.stringify(parsed),
      normalizedJson: JSON.stringify(normalized),
      parseVersion: PARSE_VERSION,
    },
  });

  const savedDecision = await deps.prisma.applicationDecision.create({
    data: {
      jobPostingId: saved.id,
      score: score.totalScore,
      decision: finalDecision,
      policyAllowed: policy.allowed,
      reasons: JSON.stringify(finalReasons),
    },
  });

  const durationMs = Math.round(performance.now() - startedAt);

  deps.logger.info(
    {
      jobPostingId: saved.id,
      applicationDecisionId: savedDecision.id,
      mode,
      finalDecision,
      finalReasons,
      durationMs,
    },
    "Job decision saved",
  );

  return {
    mode,
    jobPosting: saved,
    normalized,
    score,
    policy,
    decision,
    finalDecision,
    finalReasons,
    applicationDecision: savedDecision,
    durationMs,
  };
}

export async function runCli(deps = appDeps): Promise<void> {
  try {
    await main(undefined, deps);
  } catch (error: unknown) {
    deps.logger.error(error);
    deps.exit(1);
  } finally {
    await deps.prisma.$disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runCli();
}
