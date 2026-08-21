import { AppError, serializeError } from "../../utils/errors.js";
import {
  persistJobAnalysisRecord,
  persistJobRecommendationRecord,
} from "../../utils/jobPersistence.js";
import { PARSE_VERSION, resolveJobBrowserSessionOptions } from "../constants.js";
import type { ScoringMode } from "../cli.js";
import type { AppDeps } from "../deps.js";
import {
  ALREADY_APPLIED_SCORE_SKIP_REASON,
  analyzeExtractedJob,
  buildJobDiagnostics,
  resolveDecisionOutcome,
} from "../jobEvaluation.js";
import { persistJobHistory, persistRunArtifact, persistSystemEvent } from "../observability.js";

export async function runJobFlow(
  mode: "score" | "decide" | "explore",
  url: string,
  deps: AppDeps,
  options?: {
    scoringMode?: ScoringMode;
  },
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

  const extracted = await deps.withPage(
    resolveJobBrowserSessionOptions(url),
    async (page) => deps.extractJobText(page, url),
  );

  deps.logger.info(
    {
      diagnostics: {
        adapterPlatform: extracted.platform,
        rawTextLength: extracted.rawText.length,
        title: extracted.title,
        company: extracted.company,
        location: extracted.location,
      },
    },
    "Job content extracted",
  );

  if (extracted.alreadyApplied === true) {
    const result = {
      mode,
      alreadyApplied: true,
      scoreSkipped: true,
      finalDecision: "SKIP" as const,
      finalReasons: [ALREADY_APPLIED_SCORE_SKIP_REASON],
      diagnostics: buildJobDiagnostics(extracted),
    };

    deps.logger.info(
      { url, platform: extracted.platform },
      "Skipping score evaluation for already-applied job",
    );
    await persistSystemEvent(
      {
        level: "INFO",
        scope: "job.analysis",
        message: "Skipped parsing and score evaluation for an already-applied job.",
        runType: mode,
        jobUrl: url,
        details: result,
      },
      deps,
    );
    const reportPath = await persistRunArtifact({
      category: "job-runs",
      prefix: `${mode}-already-applied`,
      payload: result,
      deps,
    });

    return {
      ...result,
      reportPath,
    };
  }

  const profile = await deps.loadCandidateProfile();

  const analysis = await analyzeExtractedJob({
    extracted,
    scoringProfile: profile,
    deps,
    ...(options?.scoringMode ? { scoringMode: options.scoringMode } : {}),
  });
  const parsed = analysis.parsed;
  const normalized = analysis.normalized;
  const score = analysis.score;
  const policy = analysis.policy;
  const decision = deps.decideJob(score);
  const outcome = resolveDecisionOutcome({
    normalized,
    scoringProfile: profile,
    policy,
    decision,
    score,
  });
  const finalDecision = outcome.finalDecision;
  const finalReasons = outcome.finalReasons;

  deps.logger.info(
    {
      parsed,
      normalized,
      provider: analysis.parseResult.provider,
      model: analysis.parseResult.model,
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
  let recommendation = null;
  try {
    const persisted = await persistJobAnalysisRecord({
      prisma: deps.prisma as never,
      logger: deps.logger,
      url,
      extracted,
      parsed,
      normalized,
      score: score.totalScore,
      finalDecision,
      policyAllowed: policy.allowed,
      reasons: finalReasons,
      parseVersion: PARSE_VERSION,
    });
    saved = persisted.jobPosting;
    savedDecision = persisted.applicationDecision;
    if (mode === "explore") {
      recommendation = await persistJobRecommendationRecord({
        prisma: deps.prisma as never,
        logger: deps.logger,
        jobPostingId: saved.id,
        source: "explore",
        score: score.totalScore,
        decision: finalDecision,
        policyAllowed: policy.allowed,
        summary: finalReasons.join(" "),
        reasons: finalReasons,
        details: {
          breakdown: score.breakdown,
          parseVersion: PARSE_VERSION,
          aiAdjustment: score.aiAdjustment ?? 0,
          aiReasoning: score.aiReasoning ?? null,
          aiConfidence: score.aiConfidence ?? null,
          scoringSource: score.scoringSource ?? "deterministic",
          workplacePolicyBypassed: outcome.workplacePolicyBypassed,
        },
      });
    }
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
        aiAdjustment: score.aiAdjustment ?? 0,
        aiReasoning: score.aiReasoning ?? null,
        aiConfidence: score.aiConfidence ?? null,
        scoringSource: score.scoringSource ?? "deterministic",
        workplacePolicyBypassed: outcome.workplacePolicyBypassed,
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
        workplacePolicyBypassed: outcome.workplacePolicyBypassed,
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
    ...(recommendation ? { recommendation } : {}),
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
