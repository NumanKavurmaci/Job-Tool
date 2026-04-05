import {
  DEFAULT_SCORE_THRESHOLD,
  DEFAULT_LINKEDIN_EASY_APPLY_URL,
  DEFAULT_RESUME_PATH,
  resolveLinkedInSingleJobUrl,
  isLinkedInCollectionUrl,
} from "./constants.js";

export type CliArgs =
  | { mode: "score" | "decide"; url: string; useAiScoreAdjustment: boolean }
  | { mode: "easy-apply"; url: string; resumePath: string; dryRun?: boolean }
  | { mode: "apply"; url: string; resumePath: string; dryRun?: boolean }
  | { mode: "external-apply"; url: string; resumePath: string; dryRun?: boolean }
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

export function parseCliArgs(args = process.argv.slice(2)): CliArgs {
  const [first] = args;
  const tail = args.slice(1);
  const normalizedFirst =
    first === "easy-apply-dry-run"
      ? "easy-apply"
      : first === "apply-dry-run"
        ? "apply"
      : first === "external-apply-dry-run"
        ? "external-apply"
        : first;
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
      'Usage: npm run dev -- <job-url> | npm run dev -- score "<job-url>" | npm run dev -- decide "<job-url>" | npm run dev -- build-profile --resume "./cv.pdf" --linkedin "https://linkedin.com/in/..." | npm run dev -- answer-questions --resume "./cv.pdf" --linkedin "https://linkedin.com/in/..." --questions "./questions.json" | npm run dev -- easy-apply "<linkedin-job-url>" --dry-run | npm run dev -- apply "<linkedin-job-or-collection-url>" --dry-run --count 3 | npm run dev -- external-apply "<external-application-url>" --dry-run',
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

  if (normalizedFirst === "easy-apply" && (dryRun || hasFlag("--count") || isLinkedInCollectionUrl(getPositionalTailArgs()[0] ?? DEFAULT_LINKEDIN_EASY_APPLY_URL) || first === "easy-apply-dry-run")) {
    const resumePath = getFlag("--resume") ?? DEFAULT_RESUME_PATH;
    const positionalArgs = getPositionalTailArgs();
    const countFromFlag = getIntegerFlag("--count");
    const scoreThreshold =
      getIntegerFlag("--score-threshold") ?? DEFAULT_SCORE_THRESHOLD;
    const disableAiEvaluation = hasFlag("--disable-ai-evaluation");
    const trailingPositional = positionalArgs.at(-1);
    const positionalCount =
      !countFromFlag && trailingPositional && /^\d+$/.test(trailingPositional)
        ? Number.parseInt(trailingPositional, 10)
        : undefined;
    const count = countFromFlag ?? positionalCount ?? 1;
    const url =
      (positionalCount ? positionalArgs.slice(0, -1) : positionalArgs)[0] ??
      DEFAULT_LINKEDIN_EASY_APPLY_URL;
    const normalizedUrl = count === 1 ? resolveLinkedInSingleJobUrl(url) : url;

    if (!resumePath) {
      throw new Error(
        `--resume is required for easy-apply${dryRun ? " --dry-run" : ""} when no default CV is available.`,
      );
    }

    if (isLinkedInCollectionUrl(normalizedUrl) || count > 1) {
      return {
        mode: "easy-apply-batch",
        url: normalizedUrl,
        resumePath,
        count,
        disableAiEvaluation,
        scoreThreshold,
        useAiScoreAdjustment,
        dryRun,
      };
    }

    return {
      mode: "easy-apply",
      url: normalizedUrl,
      resumePath,
      dryRun,
    };
  }

  if (normalizedFirst === "apply" && (dryRun || hasFlag("--count") || isLinkedInCollectionUrl(getPositionalTailArgs()[0] ?? DEFAULT_LINKEDIN_EASY_APPLY_URL) || first === "apply-dry-run")) {
    const resumePath = getFlag("--resume") ?? DEFAULT_RESUME_PATH;
    const positionalArgs = getPositionalTailArgs();
    const countFromFlag = getIntegerFlag("--count");
    const scoreThreshold =
      getIntegerFlag("--score-threshold") ?? DEFAULT_SCORE_THRESHOLD;
    const disableAiEvaluation = hasFlag("--disable-ai-evaluation");
    const trailingPositional = positionalArgs.at(-1);
    const positionalCount =
      !countFromFlag && trailingPositional && /^\d+$/.test(trailingPositional)
        ? Number.parseInt(trailingPositional, 10)
        : undefined;
    const count = countFromFlag ?? positionalCount ?? 1;
    const url =
      (positionalCount ? positionalArgs.slice(0, -1) : positionalArgs)[0] ??
      DEFAULT_LINKEDIN_EASY_APPLY_URL;
    const normalizedUrl = count === 1 ? resolveLinkedInSingleJobUrl(url) : url;

    if (!resumePath) {
      throw new Error(
        `--resume is required for apply${dryRun ? " --dry-run" : ""} when no default CV is available.`,
      );
    }

    if (isLinkedInCollectionUrl(normalizedUrl) || count > 1) {
      return {
        mode: "apply-batch",
        url: normalizedUrl,
        resumePath,
        count,
        disableAiEvaluation,
        scoreThreshold,
        useAiScoreAdjustment,
        dryRun,
      };
    }

    return {
      mode: "apply",
      url: normalizedUrl,
      resumePath,
      dryRun,
    };
  }

  if (normalizedFirst === "external-apply") {
    const resumePath = getFlag("--resume") ?? DEFAULT_RESUME_PATH;
    const positionalArgs = getPositionalTailArgs();
    const url = positionalArgs[0];

    if (!resumePath) {
      throw new Error(
        `--resume is required for external-apply${dryRun ? " --dry-run" : ""} when no default CV is available.`,
      );
    }
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
    const resumePath = getFlag("--resume") ?? DEFAULT_RESUME_PATH;
    const positionalArgs = getPositionalTailArgs();
    const url = positionalArgs[0];
    const normalizedUrl = url ? resolveLinkedInSingleJobUrl(url) : url;
    if (!resumePath) {
      throw new Error(
        `--resume is required for apply${dryRun ? " --dry-run" : ""} when no default CV is available.`,
      );
    }
    if (!normalizedUrl) {
      throw new Error("--url is required for apply.");
    }
    if (isLinkedInCollectionUrl(normalizedUrl)) {
      throw new Error(
        "apply requires a single LinkedIn job URL, not a collection URL.",
      );
    }
    return { mode: "apply", url: normalizedUrl, resumePath, dryRun };
  }

  if (normalizedFirst === "easy-apply") {
    const resumePath = getFlag("--resume") ?? DEFAULT_RESUME_PATH;
    const positionalArgs = getPositionalTailArgs();
    const url = positionalArgs[0];
    const normalizedUrl = url ? resolveLinkedInSingleJobUrl(url) : url;
    if (!resumePath) {
      throw new Error(
        `--resume is required for easy-apply${dryRun ? " --dry-run" : ""} when no default CV is available.`,
      );
    }
    if (!normalizedUrl) {
      throw new Error("--url is required for easy-apply.");
    }
    if (isLinkedInCollectionUrl(normalizedUrl)) {
      throw new Error(
        "easy-apply requires a single LinkedIn job URL, not a collection URL.",
      );
    }
    return { mode: "easy-apply", url: normalizedUrl, resumePath, dryRun };
  }

  if (normalizedFirst === "easy-apply-batch") {
    const resumePath = getFlag("--resume") ?? DEFAULT_RESUME_PATH;
    const positionalArgs = getPositionalTailArgs();
    const countFromFlag = getIntegerFlag("--count");
    const scoreThreshold =
      getIntegerFlag("--score-threshold") ?? DEFAULT_SCORE_THRESHOLD;
    const disableAiEvaluation = hasFlag("--disable-ai-evaluation");
    const trailingPositional = positionalArgs.at(-1);
    const positionalCount =
      !countFromFlag && trailingPositional && /^\d+$/.test(trailingPositional)
        ? Number.parseInt(trailingPositional, 10)
        : undefined;
    const count = countFromFlag ?? positionalCount ?? 1;
    const url =
      (positionalCount ? positionalArgs.slice(0, -1) : positionalArgs)[0] ??
      DEFAULT_LINKEDIN_EASY_APPLY_URL;

    if (!resumePath) {
      throw new Error(
        "--resume is required for easy-apply-batch when no default CV is available.",
      );
    }
    if (!isLinkedInCollectionUrl(url)) {
      throw new Error(
        "easy-apply-batch requires a LinkedIn collection URL or the default collection.",
      );
    }

    return {
      mode: "easy-apply-batch",
      url,
      resumePath,
      count,
      disableAiEvaluation,
      scoreThreshold,
      useAiScoreAdjustment,
      dryRun,
    };
  }

  if (normalizedFirst === "apply-batch") {
    const resumePath = getFlag("--resume") ?? DEFAULT_RESUME_PATH;
    const positionalArgs = getPositionalTailArgs();
    const countFromFlag = getIntegerFlag("--count");
    const scoreThreshold =
      getIntegerFlag("--score-threshold") ?? DEFAULT_SCORE_THRESHOLD;
    const disableAiEvaluation = hasFlag("--disable-ai-evaluation");
    const trailingPositional = positionalArgs.at(-1);
    const positionalCount =
      !countFromFlag && trailingPositional && /^\d+$/.test(trailingPositional)
        ? Number.parseInt(trailingPositional, 10)
        : undefined;
    const count = countFromFlag ?? positionalCount ?? 1;
    const url =
      (positionalCount ? positionalArgs.slice(0, -1) : positionalArgs)[0] ??
      DEFAULT_LINKEDIN_EASY_APPLY_URL;

    if (!resumePath) {
      throw new Error(
        "--resume is required for apply-batch when no default CV is available.",
      );
    }
    if (!isLinkedInCollectionUrl(url)) {
      throw new Error(
        "apply-batch requires a LinkedIn collection URL or the default collection.",
      );
    }

    return {
      mode: "apply-batch",
      url,
      resumePath,
      count,
      disableAiEvaluation,
      scoreThreshold,
      useAiScoreAdjustment,
      dryRun,
    };
  }

  if ((first === "score" || first === "decide") && tail[0]) {
    return { mode: first, url: tail[0], useAiScoreAdjustment };
  }

  return { mode: "decide", url: first, useAiScoreAdjustment };
}
