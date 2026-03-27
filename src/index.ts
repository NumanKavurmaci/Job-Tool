import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { resolveAnswer } from "./answers/resolveAnswer.js";
import { withPage } from "./browser/playwright.js";
import { loadCandidateMasterProfile } from "./candidate/loadCandidateProfile.js";
import { prisma } from "./db/client.js";
import { normalizeParsedJob } from "./domain/job.js";
import { runEasyApplyDryRun } from "./linkedin/easyApply.js";
import { parseJob } from "./llm/parseJob.js";
import { getConfiguredProviderInfo } from "./llm/providers/resolveProvider.js";
import { extractJobText } from "./parser/extractJobText.js";
import { formatJobForLLM } from "./parser/formatJobForLLM.js";
import { evaluatePolicy } from "./policy/policyEngine.js";
import { loadCandidateProfile } from "./profile/candidate.js";
import type { InputQuestion } from "./questions/types.js";
import { decideJob } from "./scoring/decision.js";
import { AppError } from "./utils/errors.js";
import { scoreJob } from "./scoring/scoreJob.js";
import { getErrorMessage, serializeError } from "./utils/errors.js";
import { logger } from "./utils/logger.js";

export const PARSE_VERSION = "phase-5";
export const DEFAULT_LINKEDIN_EASY_APPLY_URL =
  "https://www.linkedin.com/jobs/collections/easy-apply";

function findDefaultResumePath(): string | undefined {
  const match = readdirSync(process.cwd()).find((entry) =>
    /CV Resume\.pdf$/i.test(entry),
  );
  return match;
}

const DEFAULT_RESUME_PATH = findDefaultResumePath();

export const appDeps = {
  withPage,
  prisma,
  loadCandidateMasterProfile,
  resolveAnswer,
  extractJobText,
  formatJobForLLM,
  parseJob,
  getConfiguredProviderInfo,
  normalizeParsedJob,
  loadCandidateProfile,
  scoreJob,
  evaluatePolicy,
  decideJob,
  runEasyApplyDryRun,
  createEasyApplyDriver: async (page: unknown) => {
    const { PlaywrightLinkedInEasyApplyDriver } =
      await import("./linkedin/playwrightEasyApplyDriver.js");
    return new PlaywrightLinkedInEasyApplyDriver(
      page as Parameters<Parameters<typeof withPage>[0]>[0],
    );
  },
  logger,
  exit: (code: number) => process.exit(code),
};

export type CliArgs =
  | { mode: "score" | "decide"; url: string }
  | { mode: "easy-apply-dry-run"; url: string; resumePath: string }
  | { mode: "easy-apply-dry-run"; url: string; resumePath: string }
  | {
      mode: "build-profile";
      resumePath: string;
      linkedinUrl?: string;
    }
  | {
      mode: "answer-questions";
      resumePath: string;
      linkedinUrl?: string;
      questionsPath: string;
    };

export function parseCliArgs(args = process.argv.slice(2)): CliArgs {
  const [first, second, ...rest] = args;

  const getFlag = (name: string): string | undefined => {
    const index = rest.findIndex((value) => value === name);
    return index === -1 ? undefined : rest[index + 1];
  };

  if (!first) {
    throw new Error(
      'Usage: npm run dev -- <job-url> | npm run dev -- score "<job-url>" | npm run dev -- decide "<job-url>" | npm run dev -- build-profile --resume "./cv.pdf" --linkedin "https://linkedin.com/in/..." | npm run dev -- answer-questions --resume "./cv.pdf" --linkedin "https://linkedin.com/in/..." --questions "./questions.json" | npm run dev -- easy-apply-dry-run "<linkedin-job-url>"',
    );
  }

  if (first === "build-profile") {
    const resumePath =
      (second === "--resume" ? rest[0] : getFlag("--resume")) ??
      DEFAULT_RESUME_PATH;
    const linkedinUrl = getFlag("--linkedin");

    if (!resumePath) {
      throw new Error("--resume is required for build-profile.");
    }

    return {
      mode: "build-profile",
      resumePath,
      ...(linkedinUrl ? { linkedinUrl } : {}),
    };
  }

  if (first === "answer-questions") {
    const resumePath =
      (second === "--resume" ? rest[0] : getFlag("--resume")) ??
      DEFAULT_RESUME_PATH;
    const linkedinUrl = getFlag("--linkedin");
    const questionsPath = getFlag("--questions");

    if (!resumePath) {
      throw new Error("--resume is required for answer-questions.");
    }

    if (!questionsPath) {
      throw new Error("--questions is required for answer-questions.");
    }

    return {
      mode: "answer-questions",
      resumePath,
      ...(linkedinUrl ? { linkedinUrl } : {}),
      questionsPath,
    };
  }

  if (first === "easy-apply-dry-run") {
    const resumePath =
      (second === "--resume" ? rest[0] : getFlag("--resume")) ??
      DEFAULT_RESUME_PATH;
    const url =
      second && !second.startsWith("--")
        ? second
        : (rest.find((value) => !value.startsWith("--")) ??
          DEFAULT_LINKEDIN_EASY_APPLY_URL);

    if (!resumePath) {
      throw new Error(
        "--resume is required for easy-apply-dry-run when no default CV is available.",
      );
    }

    return {
      mode: "easy-apply-dry-run",
      url,
      resumePath,
    };
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

async function runJobFlow(
  mode: "score" | "decide",
  url: string,
  deps = appDeps,
) {
  deps.logger.info({ url }, "Starting job fetch");
  const profile = await deps.loadCandidateProfile();

  const extracted = await deps.withPage(async (page) =>
    deps.extractJobText(page, url),
  );

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
  deps.logger.info(
    { breakdown: score.breakdown, totalScore: score.totalScore },
    "Job scored",
  );
  deps.logger.info(
    { policyAllowed: policy.allowed, policyReasons: policy.reasons },
    "Policy evaluated",
  );

  let saved;
  let savedDecision;
  try {
    saved = await deps.prisma.jobPosting.upsert({
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

    savedDecision = await deps.prisma.applicationDecision.create({
      data: {
        jobPostingId: saved.id,
        score: score.totalScore,
        decision: finalDecision,
        policyAllowed: policy.allowed,
        reasons: JSON.stringify(finalReasons),
      },
    });
  } catch (error) {
    throw new AppError({
      message: "Failed to save job analysis to the database.",
      phase: "database",
      code: "DATABASE_WRITE_FAILED",
      cause: error,
      details: { url },
    });
  }

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
  };
}

async function runBuildProfileFlow(
  args: Extract<CliArgs, { mode: "build-profile" }>,
  deps = appDeps,
) {
  const profile = await deps.loadCandidateMasterProfile({
    resumePath: args.resumePath,
    ...(args.linkedinUrl ? { linkedinUrl: args.linkedinUrl } : {}),
  });

  let snapshot;
  try {
    snapshot = await deps.prisma.candidateProfileSnapshot.create({
      data: {
        fullName: profile.fullName,
        linkedinUrl: profile.linkedinUrl,
        resumePath: profile.sourceMetadata.resumePath ?? null,
        profileJson: JSON.stringify(profile),
      },
    });
  } catch (error) {
    throw new AppError({
      message: "Failed to save candidate profile snapshot to the database.",
      phase: "database",
      code: "DATABASE_CANDIDATE_SNAPSHOT_FAILED",
      cause: error,
    });
  }

  deps.logger.info(
    {
      candidateProfileSnapshotId: snapshot.id,
      fullName: profile.fullName,
      linkedinUrl: profile.linkedinUrl,
    },
    "Candidate profile snapshot saved",
  );

  return {
    mode: args.mode,
    profile,
    snapshot,
  };
}

async function runAnswerQuestionsFlow(
  args: Extract<CliArgs, { mode: "answer-questions" }>,
  deps = appDeps,
) {
  const profile = await deps.loadCandidateMasterProfile({
    resumePath: args.resumePath,
    ...(args.linkedinUrl ? { linkedinUrl: args.linkedinUrl } : {}),
  });

  let snapshot;
  let preparedAnswerSet;
  try {
    snapshot = await deps.prisma.candidateProfileSnapshot.create({
      data: {
        fullName: profile.fullName,
        linkedinUrl: profile.linkedinUrl,
        resumePath: profile.sourceMetadata.resumePath ?? null,
        profileJson: JSON.stringify(profile),
      },
    });
  } catch (error) {
    throw new AppError({
      message: "Failed to save candidate profile snapshot to the database.",
      phase: "database",
      code: "DATABASE_CANDIDATE_SNAPSHOT_FAILED",
      cause: error,
    });
  }

  const questions = JSON.parse(
    await readFile(args.questionsPath, "utf8"),
  ) as InputQuestion[];
  const answers = await Promise.all(
    questions.map(async (question) => ({
      question,
      resolved: await deps.resolveAnswer({
        question,
        candidateProfile: profile,
      }),
    })),
  );

  try {
    preparedAnswerSet = await deps.prisma.preparedAnswerSet.create({
      data: {
        candidateProfileId: snapshot.id,
        questionsJson: JSON.stringify(questions),
        answersJson: JSON.stringify(answers),
      },
    });
  } catch (error) {
    throw new AppError({
      message: "Failed to save prepared answers to the database.",
      phase: "database",
      code: "DATABASE_PREPARED_ANSWERS_FAILED",
      cause: error,
    });
  }

  deps.logger.info(
    {
      preparedAnswerSetId: preparedAnswerSet.id,
      answerCount: answers.length,
    },
    "Prepared answer set saved",
  );

  return {
    mode: args.mode,
    profile,
    snapshot,
    answers,
    preparedAnswerSet,
  };
}

async function runEasyApplyDryRunFlow(
  args: Extract<CliArgs, { mode: "easy-apply-dry-run" }>,
  deps = appDeps,
) {
  const profile = await deps.loadCandidateMasterProfile({
    resumePath: args.resumePath,
  });

  let result;
  try {
    result = await deps.withPage(async (page) =>
      deps.runEasyApplyDryRun({
        driver: await deps.createEasyApplyDriver(page),
        url: args.url,
        candidateProfile: profile,
        resolveAnswer: ({ question, candidateProfile }) =>
          deps.resolveAnswer({ question, candidateProfile }),
      }),
    );
  } catch (error) {
    throw new AppError({
      message: "LinkedIn Easy Apply flow failed.",
      phase: "linkedin_easy_apply",
      code: "LINKEDIN_EASY_APPLY_FAILED",
      cause: error,
      details: { url: args.url },
    });
  }

  deps.logger.info(
    {
      status: result.status,
      stepCount: result.steps.length,
      stopReason: result.stopReason,
    },
    "LinkedIn Easy Apply dry run finished",
  );

  return {
    mode: args.mode,
    profile,
    easyApply: result,
  };
}

export async function main(cliArgs = process.argv.slice(2), deps = appDeps) {
  const startedAt = performance.now();
  const args = Array.isArray(cliArgs)
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

  let result;
  if (args.mode === "build-profile") {
    result = await runBuildProfileFlow(args, deps);
  } else if (args.mode === "answer-questions") {
    result = await runAnswerQuestionsFlow(args, deps);
  } else if (args.mode === "easy-apply-dry-run") {
    result = await runEasyApplyDryRunFlow(args, deps);
  } else {
    result = await runJobFlow(args.mode, args.url, deps);
  }

  return {
    ...result,
    durationMs: Math.round(performance.now() - startedAt),
  };
}

export async function runCli(deps = appDeps): Promise<void> {
  try {
    await main(undefined, deps);
  } catch (error: unknown) {
    deps.logger.error(
      {
        event: "cli.failed",
        error: serializeError(error),
      },
      "CLI execution failed",
    );
    process.stderr.write(`Error: ${getErrorMessage(error)}\n`);
    deps.exit(1);
  } finally {
    await deps.prisma.$disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runCli();
}
