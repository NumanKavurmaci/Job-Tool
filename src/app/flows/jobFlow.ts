import { AppError, serializeError } from "../../utils/errors.js";
import { LINKEDIN_BROWSER_SESSION_OPTIONS, PARSE_VERSION } from "../constants.js";
import type { AppDeps } from "../deps.js";
import { persistJobHistory, persistRunArtifact, persistSystemEvent } from "../observability.js";

export async function runJobFlow(
  mode: "score" | "decide",
  url: string,
  deps: AppDeps,
) {
  const guaranteedStartEvent = {
    level: "INFO" as const,
    scope: "job.analysis",
    message: "Starting job analysis flow.",
    runType: mode,
    jobUrl: url,
  };
  deps.logger.info({ url }, "Starting job fetch");
  await persistSystemEvent(
    guaranteedStartEvent,
    deps,
  );

  const profile = await deps.loadCandidateProfile();
  const extracted = await deps.withPage(
    url.includes("linkedin.com") ? LINKEDIN_BROWSER_SESSION_OPTIONS : {},
    async (page) => deps.extractJobText(page, url),
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
    await persistSystemEvent(
      {
        level: "ERROR",
        scope: "database.job_analysis",
        message: "Failed to save job analysis to the database.",
        runType: mode,
        jobUrl: url,
        details: { error: serializeError(error) },
      },
      deps,
    );
    throw new AppError({
      message: "Failed to save job analysis to the database.",
      phase: "database",
      code: "DATABASE_WRITE_FAILED",
      cause: error,
      details: { url },
    });
  }

  await persistJobHistory(
    {
      jobPostingId: saved.id,
      jobUrl: url,
      source: mode,
      status: finalDecision === "SKIP" ? "SKIPPED" : "EVALUATED",
      score: score.totalScore,
      decision: finalDecision,
      policyAllowed: policy.allowed,
      reasons: finalReasons,
      summary: finalReasons.join(" "),
      ...(normalized.platform ? { platform: normalized.platform } : {}),
      details: {
        breakdown: score.breakdown,
        parseVersion: PARSE_VERSION,
      },
    },
    deps,
  );
  await persistSystemEvent(
    {
      level: "INFO",
      scope: "job.analysis",
      message: "Job analysis saved.",
      runType: mode,
      jobPostingId: saved.id,
      jobUrl: url,
      details: {
        finalDecision,
        score: score.totalScore,
      },
    },
    deps,
  );

  const result = {
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

  const reportPath = await persistRunArtifact({
    category: "job-runs",
    prefix: mode,
    payload: result,
    deps,
  });

  return {
    ...result,
    reportPath,
  };
}
