import {
  DEFAULT_SCORE_THRESHOLD,
  DEFAULT_LINKEDIN_EASY_APPLY_URL,
  DEFAULT_RESUME_PATH,
  resolveLinkedInSingleJobUrl,
  isLinkedInCollectionUrl,
} from "./constants.js";

export type CliArgs =
  | { mode: "score" | "decide" | "explore"; url: string; useAiScoreAdjustment: boolean }
  | { mode: "easy-apply"; url: string; resumePath: string; dryRun?: boolean }
  | { mode: "apply"; url: string; resumePath: string; dryRun?: boolean }
  | { mode: "external-apply"; url: string; resumePath: string; dryRun?: boolean }
  | {
      mode: "explore-batch";
      url: string;
      count: number;
      disableAiEvaluation: boolean;
      scoreThreshold: number;
      useAiScoreAdjustment: boolean;
    }
  | {
      mode: "easy-apply-batch";
      url: string;
      resumePath: string;
      count: number;
      disableAiEvaluation: boolean;
      scoreThreshold: number;
      useAiScoreAdjustment: boolean;
      dryRun?: boolean;
    }
  | {
      mode: "apply-batch";
      url: string;
      resumePath: string;
      count: number;
      disableAiEvaluation: boolean;
      scoreThreshold: number;
      useAiScoreAdjustment: boolean;
      dryRun?: boolean;
    }
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

type LinkedInBatchMode = "easy-apply-batch" | "apply-batch" | "explore-batch";
type LinkedInSingleMode = "easy-apply" | "apply";

export function parseCliArgs(args = process.argv.slice(2)): CliArgs {
  const [first] = args;
  const tail = args.slice(1);
  const normalizedFirst = normalizeCommandName(first);
  const valueFlags = new Set([
    "--resume",
    "--linkedin",
    "--questions",
    "--count",
    "--score-threshold",
  ]);

  const getFlag = (name: string): string | undefined => {
    const index = tail.findIndex((value) => value === name);
    return index === -1 ? undefined : tail[index + 1];
  };
  const getPositionalTailArgs = (): string[] => {
    const positionals: string[] = [];
    for (let index = 0; index < tail.length; index += 1) {
      const value = tail[index];
      if (!value) {
        continue;
      }

      if (valueFlags.has(value)) {
        index += 1;
        continue;
      }

      if (!value.startsWith("--")) {
        positionals.push(value);
      }
    }

    return positionals;
  };
  const getIntegerFlag = (name: string): number | undefined => {
    const value = getFlag(name);
    if (!value) {
      return undefined;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new Error(`${name} must be a positive integer.`);
    }

    return parsed;
  };
  const hasFlag = (name: string): boolean => tail.includes(name);
  const dryRun =
    hasFlag("--dry-run") ||
    first === "easy-apply-dry-run" ||
    first === "apply-dry-run" ||
    first === "external-apply-dry-run";
  const useAiScoreAdjustment = hasFlag("--ai-score-adjustment");

  if (!first) {
    throw new Error(
      'Usage: npm run dev -- <job-url> | npm run dev -- score "<job-url>" | npm run dev -- decide "<job-url>" | npm run dev -- explore "<job-url>" | npm run dev -- explore-batch "<linkedin-collection-url>" --count 25 | npm run dev -- build-profile --resume "./cv.pdf" --linkedin "https://linkedin.com/in/..." | npm run dev -- answer-questions --resume "./cv.pdf" --linkedin "https://linkedin.com/in/..." --questions "./questions.json" | npm run dev -- easy-apply "<linkedin-job-url>" --dry-run | npm run dev -- apply "<linkedin-job-or-collection-url>" --dry-run --count 3 | npm run dev -- external-apply "<external-application-url>" --dry-run',
    );
  }

  if (first === "build-profile") {
    const resumePath = getFlag("--resume") ?? DEFAULT_RESUME_PATH;
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
    const resumePath = getFlag("--resume") ?? DEFAULT_RESUME_PATH;
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

  if (normalizedFirst === "explore-batch") {
    return parseExploreBatchCommand({
      positionalArgs: getPositionalTailArgs(),
      getIntegerFlag,
      hasFlag,
      useAiScoreAdjustment,
    });
  }

  if (
    normalizedFirst === "easy-apply" &&
    looksLikeImplicitLinkedInBatch({
      dryRun,
      hasCountFlag: hasFlag("--count"),
      positionalArgs: getPositionalTailArgs(),
      originalCommand: first,
    })
  ) {
    return parseLinkedInFamilyCommand({
      family: "easy-apply",
      resumePath: getRequiredResumePath({
        requestedMode: "easy-apply",
        dryRun,
        getFlag,
      }),
      positionalArgs: getPositionalTailArgs(),
      getIntegerFlag,
      hasFlag,
      useAiScoreAdjustment,
      dryRun,
    });
  }

  if (
    normalizedFirst === "apply" &&
    looksLikeImplicitLinkedInBatch({
      dryRun,
      hasCountFlag: hasFlag("--count"),
      positionalArgs: getPositionalTailArgs(),
      originalCommand: first,
    })
  ) {
    return parseLinkedInFamilyCommand({
      family: "apply",
      resumePath: getRequiredResumePath({
        requestedMode: "apply",
        dryRun,
        getFlag,
      }),
      positionalArgs: getPositionalTailArgs(),
      getIntegerFlag,
      hasFlag,
      useAiScoreAdjustment,
      dryRun,
    });
  }

  if (normalizedFirst === "external-apply") {
    const resumePath = getRequiredResumePath({
      requestedMode: "external-apply",
      dryRun,
      getFlag,
    });
    const positionalArgs = getPositionalTailArgs();
    const url = positionalArgs[0];

    if (!url) {
      throw new Error("--url is required for external-apply.");
    }

    return {
      mode: "external-apply",
      url,
      resumePath,
      dryRun,
    };
  }

  if (normalizedFirst === "apply") {
    return parseExplicitLinkedInSingleCommand({
      mode: "apply",
      resumePath: getRequiredResumePath({
        requestedMode: "apply",
        dryRun,
        getFlag,
      }),
      positionalArgs: getPositionalTailArgs(),
      dryRun,
    });
  }

  if (normalizedFirst === "easy-apply") {
    return parseExplicitLinkedInSingleCommand({
      mode: "easy-apply",
      resumePath: getRequiredResumePath({
        requestedMode: "easy-apply",
        dryRun,
        getFlag,
      }),
      positionalArgs: getPositionalTailArgs(),
      dryRun,
    });
  }

  if (normalizedFirst === "easy-apply-batch") {
    const batchOptions = readLinkedInBatchOptions({
      positionalArgs: getPositionalTailArgs(),
      getIntegerFlag,
      hasFlag,
      useAiScoreAdjustment,
    });
    assertLinkedInCollectionMode("easy-apply-batch", batchOptions.url);
    return {
      mode: "easy-apply-batch",
      ...batchOptions,
      resumePath: getRequiredResumePath({
        requestedMode: "easy-apply-batch",
        dryRun,
        getFlag,
      }),
      dryRun,
    };
  }

  if (normalizedFirst === "apply-batch") {
    const batchOptions = readLinkedInBatchOptions({
      positionalArgs: getPositionalTailArgs(),
      getIntegerFlag,
      hasFlag,
      useAiScoreAdjustment,
    });
    assertLinkedInCollectionMode("apply-batch", batchOptions.url);
    return {
      mode: "apply-batch",
      ...batchOptions,
      resumePath: getRequiredResumePath({
        requestedMode: "apply-batch",
        dryRun,
        getFlag,
      }),
      dryRun,
    };
  }

  if ((first === "score" || first === "decide" || first === "explore") && tail[0]) {
    return { mode: first, url: tail[0], useAiScoreAdjustment };
  }

  return { mode: "decide", url: first, useAiScoreAdjustment };
}

function normalizeCommandName(command?: string): string | undefined {
  if (command === "easy-apply-dry-run") {
    return "easy-apply";
  }
  if (command === "apply-dry-run") {
    return "apply";
  }
  if (command === "external-apply-dry-run") {
    return "external-apply";
  }
  return command;
}

function getRequiredResumePath(args: {
  requestedMode: string;
  dryRun: boolean;
  getFlag: (name: string) => string | undefined;
}) {
  const resumePath = args.getFlag("--resume") ?? DEFAULT_RESUME_PATH;
  if (!resumePath) {
    throw new Error(
      `--resume is required for ${args.requestedMode}${args.dryRun ? " --dry-run" : ""} when no default CV is available.`,
    );
  }
  return resumePath;
}

function looksLikeImplicitLinkedInBatch(args: {
  dryRun: boolean;
  hasCountFlag: boolean;
  positionalArgs: string[];
  originalCommand?: string;
}) {
  return (
    args.dryRun ||
    args.hasCountFlag ||
    isLinkedInCollectionUrl(args.positionalArgs[0] ?? DEFAULT_LINKEDIN_EASY_APPLY_URL) ||
    args.originalCommand === "easy-apply-dry-run" ||
    args.originalCommand === "apply-dry-run"
  );
}

function readLinkedInBatchShape(args: {
  positionalArgs: string[];
  getIntegerFlag: (name: string) => number | undefined;
}) {
  const countFromFlag = args.getIntegerFlag("--count");
  const trailingPositional = args.positionalArgs.at(-1);
  const positionalCount =
    !countFromFlag && trailingPositional && /^\d+$/.test(trailingPositional)
      ? Number.parseInt(trailingPositional, 10)
      : undefined;
  const count = countFromFlag ?? positionalCount ?? 1;
  const url =
    (positionalCount ? args.positionalArgs.slice(0, -1) : args.positionalArgs)[0] ??
    DEFAULT_LINKEDIN_EASY_APPLY_URL;

  return {
    count,
    url,
    scoreThreshold:
      args.getIntegerFlag("--score-threshold") ?? DEFAULT_SCORE_THRESHOLD,
  };
}

function readLinkedInBatchOptions(args: {
  positionalArgs: string[];
  getIntegerFlag: (name: string) => number | undefined;
  hasFlag: (name: string) => boolean;
  useAiScoreAdjustment: boolean;
}) {
  const batchShape = readLinkedInBatchShape(args);
  return {
    url: batchShape.url,
    count: batchShape.count,
    disableAiEvaluation: args.hasFlag("--disable-ai-evaluation"),
    scoreThreshold: batchShape.scoreThreshold,
    useAiScoreAdjustment: args.useAiScoreAdjustment,
  };
}

function parseExploreBatchCommand(args: {
  positionalArgs: string[];
  getIntegerFlag: (name: string) => number | undefined;
  hasFlag: (name: string) => boolean;
  useAiScoreAdjustment: boolean;
}) {
  const batchOptions = readLinkedInBatchOptions(args);
  assertLinkedInCollectionMode("explore-batch", batchOptions.url);

  return {
    mode: "explore-batch" as const,
    ...batchOptions,
  };
}

function assertLinkedInCollectionMode(mode: LinkedInBatchMode, url: string) {
  if (!isLinkedInCollectionUrl(url)) {
    throw new Error(
      `${mode} requires a LinkedIn collection URL or the default collection.`,
    );
  }
}

function parseExplicitLinkedInSingleCommand(args: {
  mode: LinkedInSingleMode;
  resumePath: string;
  positionalArgs: string[];
  dryRun: boolean;
}) {
  const url = args.positionalArgs[0];
  const normalizedUrl = url ? resolveLinkedInSingleJobUrl(url) : url;
  if (!normalizedUrl) {
    throw new Error(`--url is required for ${args.mode}.`);
  }
  if (isLinkedInCollectionUrl(normalizedUrl)) {
    throw new Error(
      `${args.mode} requires a single LinkedIn job URL, not a collection URL.`,
    );
  }

  return { mode: args.mode, url: normalizedUrl, resumePath: args.resumePath, dryRun: args.dryRun };
}

function parseLinkedInFamilyCommand(args: {
  family: LinkedInSingleMode;
  resumePath: string;
  positionalArgs: string[];
  getIntegerFlag: (name: string) => number | undefined;
  hasFlag: (name: string) => boolean;
  useAiScoreAdjustment: boolean;
  dryRun: boolean;
}) {
  const batchShape = readLinkedInBatchShape(args);
  const normalizedUrl =
    batchShape.count === 1 ? resolveLinkedInSingleJobUrl(batchShape.url) : batchShape.url;

  if (isLinkedInCollectionUrl(normalizedUrl) || batchShape.count > 1) {
    return {
      mode: `${args.family}-batch` as const,
      url: normalizedUrl,
      resumePath: args.resumePath,
      count: batchShape.count,
      disableAiEvaluation: args.hasFlag("--disable-ai-evaluation"),
      scoreThreshold: batchShape.scoreThreshold,
      useAiScoreAdjustment: args.useAiScoreAdjustment,
      dryRun: args.dryRun,
    };
  }

  return {
    mode: args.family,
    url: normalizedUrl,
    resumePath: args.resumePath,
    dryRun: args.dryRun,
  };
}
