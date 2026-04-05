import { performance } from "node:perf_hooks";
import type { PromptCompletionResult } from "../../llm/completePrompt.js";
import { AppError, serializeError } from "../../utils/errors.js";
import { loadMasterProfileForArgs } from "../flowHelpers.js";
import type { CliArgs } from "../cli.js";
import type { AppDeps } from "../deps.js";
import {
  discoverExternalApplication,
  extractExternalPageText,
  followExternalApplicationLink,
  inspectExternalApplicationPage,
  planExternalApplicationAnswers,
} from "../../external/discovery.js";
import { fillExternalApplicationPage } from "../../external/fill.js";
import { persistRunArtifact, persistSystemEvent } from "../observability.js";
import type {
  ExternalApplicationPlannedAnswer,
  ExternalApplicationStepSnapshot,
} from "../../external/types.js";

type ExternalApplyArgs = Extract<CliArgs, { mode: "external-apply" }>;
type ExternalApplyRunType = "external-apply-dry-run" | "external-apply";

interface ExternalApplyOriginContext {
  originalJobUrl?: string;
}

function truncate(value: string, max = 5000) {
  return value.length <= max ? value : `${value.slice(0, max)}...`;
}

function buildNextStepPrompt(input: {
  sourceUrl: string;
  pageTitle: string;
  pageText: string;
  precursorLinks: { label: string; href: string }[];
}) {
  return [
    "You are helping an autonomous browser decide the next step for an external job application flow.",
    "Choose whether the bot should stay on the current page or follow one of the provided precursor links.",
    "Respond in exactly one line using one of these formats:",
    "STAY",
    "FOLLOW: <full href>",
    "",
    `Source URL: ${input.sourceUrl}`,
    `Page Title: ${input.pageTitle}`,
    `Available precursor links: ${input.precursorLinks.map((link) => `${link.label} -> ${link.href}`).join(" | ") || "none"}`,
    `Clean page text: ${truncate(input.pageText)}`,
  ].join("\n");
}

function chooseRecommendedLink(input: {
  text: string;
  precursorLinks: { label: string; href: string }[];
}) {
  const match = input.text.match(/FOLLOW:\s*(https?:\/\/\S+)/i);
  if (!match) {
    return null;
  }

  const href = match[1]?.trim();
  return (
    input.precursorLinks.find((candidate) => candidate.href === href) ?? null
  );
}

function advisorySaysStay(text: string): boolean {
  return /^STAY\s*$/i.test(text.trim());
}

async function persistExternalApplyAnswers(args: {
  sourceUrl: string;
  finalUrl: string;
  platform: string;
  answerPlan: ExternalApplicationPlannedAnswer[];
  profile: Awaited<ReturnType<AppDeps["loadCandidateMasterProfile"]>>;
  runType: ExternalApplyRunType;
  originalJobUrl?: string;
  deps: AppDeps;
}) {
  if (args.answerPlan.length === 0) {
    return [];
  }

  const snapshot = await args.deps.prisma.candidateProfileSnapshot.create({
    data: {
      fullName: args.profile.fullName,
      linkedinUrl: args.profile.linkedinUrl ?? null,
      resumePath: args.profile.sourceMetadata.resumePath ?? null,
      profileJson: JSON.stringify(args.profile),
    },
  });

  const jobPostingId = args.deps.prisma.jobPosting.findUnique
    ? (await args.deps.prisma.jobPosting.findUnique({
        where: { url: args.originalJobUrl ?? args.sourceUrl },
        select: { id: true },
      }))?.id ??
      (await args.deps.prisma.jobPosting.findUnique({
        where: { url: args.sourceUrl },
        select: { id: true },
      }))?.id ??
      (await args.deps.prisma.jobPosting.findUnique({
        where: { url: args.finalUrl },
        select: { id: true },
      }))?.id ??
      null
    : null;

  const preparedAnswerSet = await args.deps.prisma.preparedAnswerSet.create({
    data: {
      ...(jobPostingId ? { jobPostingId } : {}),
      candidateProfileId: snapshot.id,
      questionsJson: JSON.stringify(
        args.answerPlan.map((entry) => entry.question),
      ),
      answersJson: JSON.stringify({
        originalJobUrl: args.originalJobUrl ?? null,
        sourceUrl: args.sourceUrl,
        finalUrl: args.finalUrl,
        platform: args.platform,
        runType: args.runType,
        answers: args.answerPlan,
      }),
    },
  });

  await persistSystemEvent(
    {
      level: "INFO",
      scope: "external.apply",
      message: "External application answers saved.",
      runType: args.runType,
      jobUrl: args.sourceUrl,
      details: {
        candidateProfileSnapshotId: snapshot.id,
        preparedAnswerSetId: preparedAnswerSet.id,
        answerCount: args.answerPlan.length,
        platform: args.platform,
      },
    },
    args.deps,
  );

  return [preparedAnswerSet];
}

// ---------------------------------------------------------------------------
// Shared core – runs discovery → plan → fill, returns a rich result object.
// The `submit` flag controls whether the final action is actually triggered.
// ---------------------------------------------------------------------------

interface RunExternalApplyOptions {
  args: ExternalApplyArgs;
  deps: AppDeps;
  submit: boolean;
  originContext: ExternalApplyOriginContext | undefined;
}

const MAX_EXTERNAL_APPLICATION_STEPS = 6;

function buildExternalStepSignature(
  discovery: Pick<Awaited<ReturnType<typeof discoverExternalApplication>>, "finalUrl" | "fields">,
): string {
  return `${discovery.finalUrl}::${discovery.fields.map((field) => field.key).join("|")}`;
}

function getExternalApplyRunType(args: ExternalApplyArgs): ExternalApplyRunType {
  return args.dryRun ? "external-apply-dry-run" : "external-apply";
}

function buildExternalApplyMeta(args: {
  runType: ExternalApplyRunType;
  sourceUrl: string;
  finalUrl: string;
  durationMs: number;
  platform: string;
  fieldCount: number;
  filledCount: number;
  semanticFieldCount: number;
  manualReviewPlannedCount: number;
  semanticAnswerCount: number;
  finalStage: string;
  stopReason: string;
  followedPrecursorLink: string | null;
  recommendedAction: "stay" | "follow";
  siteFeedback: { errors: string[]; warnings: string[]; infos: string[] } | null;
}) {
  const siteFeedbackCount =
    (args.siteFeedback?.errors.length ?? 0) +
    (args.siteFeedback?.warnings.length ?? 0) +
    (args.siteFeedback?.infos.length ?? 0);

  const keyEvents = [
    `Opened external application source URL.`,
    args.followedPrecursorLink
      ? `Followed precursor link to continue the application.`
      : "Stayed on the initial application page.",
    args.fieldCount > 0
      ? `Discovered ${args.fieldCount} application field(s).`
      : "No application fields were discovered on the current page.",
    `Filled ${args.filledCount} field(s).`,
    args.semanticFieldCount > 0
      ? `Mapped ${args.semanticFieldCount} field(s) to structured semantics.`
      : "No structured field semantics were detected.",
    args.manualReviewPlannedCount > 0
      ? `Left ${args.manualReviewPlannedCount} field(s) in manual review mode.`
      : "No fields were explicitly left for manual review.",
    `Stopped at ${args.finalStage}.`,
    siteFeedbackCount > 0
      ? `Captured ${siteFeedbackCount} site feedback message(s).`
      : "No site feedback was captured.",
  ];

  return {
    durationMs: args.durationMs,
    finishedAt: new Date().toISOString(),
    summary: `${args.runType} on ${args.platform} reached ${args.finalStage} after ${args.durationMs}ms and filled ${args.filledCount}/${args.fieldCount} field(s).`,
    keyEvents,
    metrics: {
      fieldCount: args.fieldCount,
      filledCount: args.filledCount,
      semanticFieldCount: args.semanticFieldCount,
      semanticAnswerCount: args.semanticAnswerCount,
      manualReviewPlannedCount: args.manualReviewPlannedCount,
      finalStage: args.finalStage,
      siteFeedbackCount,
      precursorFollowed: Boolean(args.followedPrecursorLink),
      recommendedAction: args.recommendedAction,
    },
    urls: {
      sourceUrl: args.sourceUrl,
      finalUrl: args.finalUrl,
      ...(args.followedPrecursorLink
        ? { followedPrecursorLink: args.followedPrecursorLink }
        : {}),
    },
    stopReason: args.stopReason,
  };
}

function determineExternalFinalStage(args: {
  fillPrimaryAction: "next" | "submit" | "unknown";
  postAdvancePageText: string | null;
  postAdvanceDiscovery: Awaited<ReturnType<typeof inspectExternalApplicationPage>> | null;
}): string {
  if (
    args.postAdvancePageText &&
    /thanks for completing this form|thank you for applying/i.test(args.postAdvancePageText)
  ) {
    return "completed";
  }

  if (args.postAdvanceDiscovery?.fields.length) {
    return "form_step";
  }

  if (args.fillPrimaryAction === "next" || args.fillPrimaryAction === "submit") {
    return "final_submit_step";
  }

  return "unknown";
}

function buildExternalStepSnapshot(args: {
  stepIndex: number;
  discovery: Awaited<ReturnType<typeof discoverExternalApplication>>;
  answerPlan: ExternalApplicationPlannedAnswer[];
  fillResult: Awaited<ReturnType<typeof fillExternalApplicationPage>>;
  finalStage: string;
  stopReason: string;
}): ExternalApplicationStepSnapshot {
  return {
    stepIndex: args.stepIndex,
    pageTitle: args.discovery.pageTitle,
    finalUrl: args.discovery.finalUrl,
    fieldCount: args.discovery.fields.length,
    fieldKeys: args.discovery.fields.map((field) => field.key),
    answerPlanCount: args.answerPlan.length,
    filledCount: args.fillResult.fieldResults.filter((entry) => entry.status === "filled").length,
    blockingRequiredFields: args.fillResult.blockingRequiredFields,
    primaryAction: args.fillResult.primaryAction,
    advanced: args.fillResult.advanced,
    finalStage: args.finalStage,
    stopReason: args.stopReason,
    siteFeedback: {
      errors: args.fillResult.siteFeedback.errors,
      warnings: args.fillResult.siteFeedback.warnings,
      infos: args.fillResult.siteFeedback.infos,
    },
  };
}

async function runExternalApplyCore({
  args,
  deps,
  submit,
  originContext,
}: RunExternalApplyOptions) {
  // Shared external-apply pipeline: discover -> optionally follow precursor -> plan -> fill -> persist.
  const startedAt = performance.now();
  const runType = getExternalApplyRunType(args);
  const candidateProfile = await loadMasterProfileForArgs(args, deps);
  try {
    const result = await deps.withPage(async (page) => {
      let discovery = await discoverExternalApplication(page, args.url);
      const initialPageText = await extractExternalPageText(page);
      let aiAdvisory: PromptCompletionResult | null = null;
      let recommendedAction: "stay" | "follow" = "stay";

      if (discovery.fields.length === 0 && discovery.precursorLinks.length > 0) {
        try {
          aiAdvisory = await deps.completePrompt(
            buildNextStepPrompt({
              sourceUrl: args.url,
              pageTitle: discovery.pageTitle,
              pageText: initialPageText,
              precursorLinks: discovery.precursorLinks,
            }),
          );
        } catch (error) {
          deps.logger.info(
            {
              sourceUrl: args.url,
              reason: error instanceof Error ? error.message : String(error),
            },
            "AI precursor recommendation failed; falling back to the first discovered link",
          );
        }

        const recommendedLink = aiAdvisory
          ? advisorySaysStay(aiAdvisory.text)
            ? null
            : (chooseRecommendedLink({
                text: aiAdvisory.text,
                precursorLinks: discovery.precursorLinks,
              }) ??
              discovery.precursorLinks[0] ??
              null)
          : (discovery.precursorLinks[0] ?? null);

        if (recommendedLink) {
          recommendedAction = "follow";
          discovery = await followExternalApplicationLink(
            page,
            args.url,
            recommendedLink.href,
          );
        }
      }
      const steps: ExternalApplicationStepSnapshot[] = [];
      const allAnswerPlans: ExternalApplicationPlannedAnswer[] = [];
      let latestFillResult: Awaited<ReturnType<typeof fillExternalApplicationPage>> | null = null;
      let latestPageTextSample: string | null = null;
      let latestPostFillPageTextSample: string | null = null;
      let latestPostFillDiscovery: Awaited<ReturnType<typeof inspectExternalApplicationPage>> | null = null;
      let finalStage = "unknown";
      let stopReason = "External application stopped before any fields were processed.";
      const seenStepSignatures = new Set<string>();

      for (let stepIndex = 1; stepIndex <= MAX_EXTERNAL_APPLICATION_STEPS; stepIndex += 1) {
        seenStepSignatures.add(buildExternalStepSignature(discovery));
        const currentPageText = await extractExternalPageText(page);
        latestPageTextSample = truncate(currentPageText, 2500);
        const answerPlan = await planExternalApplicationAnswers({
          fields: discovery.fields,
          candidateProfile,
          pageContext: {
            title: discovery.pageTitle,
            text: currentPageText,
            sourceUrl: discovery.finalUrl,
          },
        });
        allAnswerPlans.push(...answerPlan);

        const fillResult = await fillExternalApplicationPage({
          page,
          discovery,
          answerPlan,
          candidateProfile,
          submit,
        });
        latestFillResult = fillResult;

        const postFillDiscovery = fillResult.advanced
          ? await inspectExternalApplicationPage(page, args.url)
          : null;
        latestPostFillDiscovery = postFillDiscovery;
        const postFillPageText = fillResult.advanced
          ? await extractExternalPageText(page)
          : null;
        latestPostFillPageTextSample = postFillPageText
          ? truncate(postFillPageText, 2500)
          : null;

        finalStage = determineExternalFinalStage({
          fillPrimaryAction: fillResult.primaryAction,
          postAdvancePageText: postFillPageText,
          postAdvanceDiscovery: postFillDiscovery,
        });

        const filledCount = fillResult.fieldResults.filter(
          (r) => r.status === "filled",
        ).length;

        stopReason = buildStopReason({
          submit,
          discovery,
          finalStage,
          filledCount,
          siteFeedback: fillResult.siteFeedback,
        });

        const repeatedStepDetected =
          fillResult.advanced &&
          postFillDiscovery != null &&
          seenStepSignatures.has(buildExternalStepSignature(postFillDiscovery));
        if (repeatedStepDetected) {
          finalStage = "form_step";
          const repeatedFeedback =
            fillResult.siteFeedback.errors[0] ??
            fillResult.siteFeedback.warnings[0] ??
            fillResult.siteFeedback.infos[0] ??
            null;
          stopReason = repeatedFeedback
            ? `The application remained on the same step after attempting to continue. Site feedback: ${repeatedFeedback}`
            : "The application remained on the same step after attempting to continue.";
        }

        steps.push(
          buildExternalStepSnapshot({
            stepIndex,
            discovery,
            answerPlan,
            fillResult,
            finalStage,
            stopReason,
          }),
        );

        if (!fillResult.advanced || finalStage !== "form_step") {
          break;
        }
        if (repeatedStepDetected) {
          break;
        }

        discovery = postFillDiscovery ?? discovery;
      }

      const fillResult =
        latestFillResult ??
        ({
          fieldResults: [],
          primaryAction: "unknown",
          advanced: false,
          blockingRequiredFields: [],
          siteFeedback: { errors: [], warnings: [], infos: [], messages: [] },
          aiCorrectionAttempts: [],
        } as Awaited<ReturnType<typeof fillExternalApplicationPage>>);

      return {
        mode: args.mode,
        dryRun: args.dryRun,
        sourceUrl: args.url,
        candidateProfile: {
          fullName: candidateProfile.fullName,
          linkedinUrl: candidateProfile.linkedinUrl,
          resumePath: candidateProfile.sourceMetadata.resumePath ?? null,
        },
        discovery,
        fillResult,
        postFillDiscovery: latestPostFillDiscovery,
        answerPlan: allAnswerPlans,
        steps,
        recommendedAction,
        pageTextSample: latestPageTextSample,
        postFillPageTextSample: latestPostFillPageTextSample,
        finalStage,
        aiAdvisory: aiAdvisory
          ? {
              text: aiAdvisory.text,
              provider: aiAdvisory.provider,
              model: aiAdvisory.model,
            }
          : null,
        stopReason,
      };
    });

    const reportPath = await persistRunArtifact({
      category: "external-apply-runs",
      prefix: runType,
      payload: {
        ...result,
        meta: buildExternalApplyMeta({
          runType,
          sourceUrl: args.url,
          finalUrl: result.discovery.finalUrl,
          durationMs: Math.round(performance.now() - startedAt),
          platform: result.discovery.platform,
          fieldCount: result.discovery.fields.length,
          filledCount: result.fillResult.fieldResults.filter(
            (entry) => entry.status === "filled",
          ).length,
          semanticFieldCount: result.discovery.fields.filter((entry) => entry.semanticKey).length,
          semanticAnswerCount: result.answerPlan.filter((entry) => entry.semanticKey).length,
          manualReviewPlannedCount: result.answerPlan.filter(
            (entry) => entry.confidenceLabel === "manual_review",
          ).length,
          finalStage: result.finalStage,
          stopReason: result.stopReason,
          followedPrecursorLink: result.discovery.followedPrecursorLink,
          recommendedAction: result.recommendedAction,
          siteFeedback: result.fillResult.siteFeedback,
        }),
      },
      deps,
    });

    const preparedAnswerSets = await persistExternalApplyAnswers({
      sourceUrl: args.url,
      finalUrl: result.discovery.finalUrl,
      platform: result.discovery.platform,
      answerPlan: result.answerPlan,
      profile: candidateProfile,
      runType,
      ...(originContext?.originalJobUrl
        ? { originalJobUrl: originContext.originalJobUrl }
        : {}),
      deps,
    });

    for (const step of result.steps) {
      await persistSystemEvent(
        {
          level: "INFO",
          scope: "external.apply.step",
          message: `External application step ${step.stepIndex} processed.`,
          runType,
          jobUrl: args.url,
          details: {
            stepIndex: step.stepIndex,
            pageTitle: step.pageTitle,
            finalUrl: step.finalUrl,
            fieldCount: step.fieldCount,
            answerPlanCount: step.answerPlanCount,
            filledCount: step.filledCount,
            primaryAction: step.primaryAction,
            advanced: step.advanced,
            finalStage: step.finalStage,
            blockingRequiredFields: step.blockingRequiredFields,
            stopReason: step.stopReason,
            siteFeedback: step.siteFeedback,
          },
        },
        deps,
      );
    }

    await persistSystemEvent(
      {
        level: "INFO",
        scope: "external.apply",
        message: submit
          ? "External application finished."
          : "External application dry run finished.",
        runType,
        jobUrl: args.url,
        details: {
          platform: result.discovery.platform,
          fieldCount: result.discovery.fields.length,
          followedPrecursorLink: result.discovery.followedPrecursorLink,
          finalStage: result.finalStage,
        },
      },
      deps,
    );

    deps.logger.info(
      {
        sourceUrl: args.url,
        platform: result.discovery.platform,
        fieldCount: result.discovery.fields.length,
        followedPrecursorLink: result.discovery.followedPrecursorLink,
      },
      submit
        ? "External application finished"
        : "External application dry run finished",
    );

    return {
      ...result,
      ...(preparedAnswerSets.length > 0 ? { preparedAnswerSets } : {}),
      reportPath,
    };
  } catch (error) {
    deps.logger.error?.(
      {
        event: "external.apply.failed",
        url: args.url,
        error: serializeError(error),
      },
      "External apply flow failed",
    );
    throw new AppError({
      message: "External apply flow failed.",
      phase: "external_apply",
      code: "EXTERNAL_APPLY_FAILED",
      cause: error,
      details: { url: args.url, submit },
    });
  }
}

// ---------------------------------------------------------------------------
// Stop-reason builder – centralises the messaging logic in one place.
// ---------------------------------------------------------------------------

interface BuildStopReasonOptions {
  submit: boolean;
  discovery: Awaited<ReturnType<typeof discoverExternalApplication>>;
  finalStage: string;
  filledCount: number;
  siteFeedback?: { errors: string[]; warnings: string[]; infos: string[] } | null;
}

function buildStopReason({
  submit,
  discovery,
  finalStage,
  filledCount,
  siteFeedback,
}: BuildStopReasonOptions): string {
  // Keep stop reasons human-readable while still surfacing the most useful site-level feedback.
  const firstFeedback =
    siteFeedback?.errors[0] ??
    siteFeedback?.warnings[0] ??
    siteFeedback?.infos[0] ??
    null;

  if (discovery.fields.length === 0) {
    return firstFeedback
      ? `No application fields were discovered on the target page. Site feedback: ${firstFeedback}`
      : "No application fields were discovered on the target page.";
  }

  if (finalStage === "completed") {
    const base = submit
      ? `Submitted the application successfully after filling ${filledCount} field(s).`
      : "Observed a completion page after filling the form.";
    return firstFeedback ? `${base} Site feedback: ${firstFeedback}` : base;
  }

  if (finalStage === "final_submit_step") {
    const base = submit
      ? `Filled ${filledCount} field(s) and submitted the application.`
      : `Filled ${filledCount} field(s) and reached the final submit step without submitting.`;
    return firstFeedback ? `${base} Site feedback: ${firstFeedback}` : base;
  }

  const base = submit
    ? `Filled ${filledCount} field(s) across ${discovery.fields.length} discovered field(s); may require additional steps.`
    : `Discovered ${discovery.fields.length} external application field(s), filled what was possible, and stopped without submitting.`;
  return firstFeedback ? `${base} Site feedback: ${firstFeedback}` : base;
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

// Public dry-run entrypoint for external applications. Stops before the terminal submit action.
export async function runExternalApplyDryRunFlow(
  args: ExternalApplyArgs,
  deps: AppDeps,
  originContext?: ExternalApplyOriginContext,
) {
  return runExternalApplyCore({
    args,
    deps,
    submit: false,
    originContext,
  });
}

// Public live entrypoint for external applications. Allows the final submit action when reached.
export async function runExternalApplyFlow(
  args: ExternalApplyArgs,
  deps: AppDeps,
  originContext?: ExternalApplyOriginContext,
) {
  return runExternalApplyCore({
    args,
    deps,
    submit: true,
    originContext,
  });
}
