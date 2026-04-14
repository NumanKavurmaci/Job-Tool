import { AppError, serializeError } from "../../utils/errors.js";
import {
  persistJobAnalysisRecord,
  persistJobRecommendationRecord,
} from "../../utils/jobPersistence.js";
import { shouldBypassWorkplacePolicy } from "../../policy/policyEngine.js";
import { LINKEDIN_BROWSER_SESSION_OPTIONS, PARSE_VERSION } from "../constants.js";
import type { AppDeps } from "../deps.js";
import { persistJobHistory, persistRunArtifact, persistSystemEvent } from "../observability.js";

export async function runJobFlow(
  mode: "score" | "decide" | "explore",
  url: string,
  deps: AppDeps,
  options?: {
    useAiScoreAdjustment?: boolean;
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

  const hasStructuredLocation = Boolean(extracted.location);
  const llmInput = deps.formatJobForLLM(extracted, {
    omitLocation: hasStructuredLocation,
  });
  const parseResult = await deps.parseJob(llmInput, {
    excludeLocation: hasStructuredLocation,
  });
  const parsed = parseResult.parsed;
  const normalized = deps.normalizeParsedJob(parsed, extracted);
  const score = options?.useAiScoreAdjustment
    ? await deps.scoreJobWithAi({
        job: normalized,
        profile,
        completePrompt: deps.completePrompt,
        logger: deps.logger,
      })
    : deps.scoreJob(normalized, profile);
  const policy = deps.evaluatePolicy(normalized, profile);
  const decision = deps.decideJob(score);
  const forceApplyForConfiguredRegion =
    shouldBypassWorkplacePolicy(normalized, profile) && policy.allowed;
  const finalDecision =
    forceApplyForConfiguredRegion ? "APPLY" : policy.allowed ? decision.decision : "SKIP";
  const finalReasons = forceApplyForConfiguredRegion
    ? [
        "Configured workplace-policy bypass matched this job location, so the role was forced to APPLY.",
      ]
    : policy.allowed
      ? [decision.reason]
      : policy.reasons;

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
