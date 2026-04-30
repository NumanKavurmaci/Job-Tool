import { shouldBypassWorkplacePolicy } from "../policy/policyEngine.js";
import type { AppDeps } from "./deps.js";

export type ScoringProfile = Awaited<ReturnType<AppDeps["loadCandidateProfile"]>>;
export type ParsedJobResult = Awaited<ReturnType<AppDeps["parseJob"]>>;
export type JobScoreResult = Awaited<ReturnType<AppDeps["scoreJobWithAi"]>>;

export function buildJobDiagnostics(
  extracted: Awaited<ReturnType<AppDeps["extractJobText"]>>,
) {
  return {
    title: extracted.title ?? null,
    company: extracted.company ?? null,
    location: extracted.location ?? null,
    companyLinkedinUrl: extracted.companyLinkedinUrl ?? null,
    applicationType: extracted.applicationType ?? null,
    companyInfoRead: Boolean(
      extracted.company || extracted.companyLinkedinUrl || extracted.companyLogoUrl,
    ),
    metadataRead: Boolean(
      extracted.title ||
        extracted.company ||
        extracted.location ||
        extracted.companyLinkedinUrl ||
        extracted.companyLogoUrl,
    ),
  };
}

export async function analyzeExtractedJob(args: {
  extracted: Awaited<ReturnType<AppDeps["extractJobText"]>>;
  scoringProfile: ScoringProfile;
  deps: AppDeps;
  useAiScoreAdjustment?: boolean;
  allowExternalLinkedInApply?: boolean;
}) {
  const hasStructuredLocation = Boolean(args.extracted.location);
  const llmInput = args.deps.formatJobForLLM(args.extracted, {
    omitLocation: hasStructuredLocation,
  });
  const parseResult = await args.deps.parseJob(llmInput, {
    excludeLocation: hasStructuredLocation,
  });
  const normalized = args.deps.normalizeParsedJob(parseResult.parsed, args.extracted);
  const score = args.useAiScoreAdjustment
    ? await args.deps.scoreJobWithAi({
        job: normalized,
        profile: args.scoringProfile,
        completePrompt: args.deps.completePrompt,
        logger: args.deps.logger,
      })
    : args.deps.scoreJob(normalized, args.scoringProfile);
  const policy = args.deps.evaluatePolicy(
    normalized,
    args.scoringProfile,
    args.allowExternalLinkedInApply != null
      ? { allowExternalLinkedInApply: args.allowExternalLinkedInApply }
      : undefined,
  );

  return {
    diagnostics: buildJobDiagnostics(args.extracted),
    parseResult,
    parsed: parseResult.parsed,
    normalized,
    score,
    policy,
  };
}

export function resolveDecisionOutcome(args: {
  normalized: Awaited<ReturnType<AppDeps["normalizeParsedJob"]>>;
  scoringProfile: ScoringProfile;
  policy: Awaited<ReturnType<AppDeps["evaluatePolicy"]>>;
  decision?: Awaited<ReturnType<AppDeps["decideJob"]>>;
  score: { totalScore: number };
  scoreThreshold?: number;
}) {
  const forceApplyForConfiguredRegion =
    shouldBypassWorkplacePolicy(args.normalized, args.scoringProfile) && args.policy.allowed;

  if (typeof args.scoreThreshold === "number") {
    const meetsThreshold = args.score.totalScore >= args.scoreThreshold;
    const finalDecision: "APPLY" | "SKIP" =
      forceApplyForConfiguredRegion || (args.policy.allowed && meetsThreshold)
        ? "APPLY"
        : "SKIP";
    const reason = forceApplyForConfiguredRegion
      ? "Configured workplace-policy bypass matched this job location, so the role will be applied."
      : !args.policy.allowed
        ? args.policy.reasons.join(" ")
        : meetsThreshold
          ? `Score ${args.score.totalScore} meets the configured threshold of ${args.scoreThreshold}.`
          : `Score ${args.score.totalScore} is below the configured threshold of ${args.scoreThreshold}.`;

    return {
      forceApplyForConfiguredRegion,
      finalDecision,
      finalReasons: !args.policy.allowed ? args.policy.reasons : [reason],
      reason,
    };
  }

  const decision = args.decision ?? { decision: "SKIP" as const, reason: "" };
  const finalDecision =
    forceApplyForConfiguredRegion ? "APPLY" : args.policy.allowed ? decision.decision : "SKIP";
  const finalReasons = forceApplyForConfiguredRegion
    ? [
        "Configured workplace-policy bypass matched this job location, so the role was forced to APPLY.",
      ]
    : args.policy.allowed
      ? [decision.reason]
      : args.policy.reasons;

  return {
    forceApplyForConfiguredRegion,
    finalDecision,
    finalReasons,
    reason: finalReasons.join(" "),
  };
}
