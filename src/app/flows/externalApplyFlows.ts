import type { PromptCompletionResult } from "../../llm/completePrompt.js";
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
import { persistRunArtifact } from "../observability.js";

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
    'Respond in exactly one line using one of these formats:',
    'STAY',
    'FOLLOW: <full href>',
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
  return input.precursorLinks.find((candidate) => candidate.href === href) ?? null;
}

function advisorySaysStay(text: string): boolean {
  return /^STAY\s*$/i.test(text.trim());
}

export async function runExternalApplyDryRunFlow(
  args: Extract<CliArgs, { mode: "external-apply-dry-run" }>,
  deps: AppDeps,
) {
  const candidateProfile = await loadMasterProfileForArgs(args, deps);

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
            }) ?? discovery.precursorLinks[0] ?? null)
        : (discovery.precursorLinks[0] ?? null);

      if (recommendedLink) {
        recommendedAction = "follow";
        discovery = await followExternalApplicationLink(page, args.url, recommendedLink.href);
      }
    }

    const finalPageText = await extractExternalPageText(page);
    const answerPlan = await planExternalApplicationAnswers({
      fields: discovery.fields,
      candidateProfile,
      pageContext: {
        title: discovery.pageTitle,
        text: finalPageText,
        sourceUrl: discovery.finalUrl,
      },
    });
    const fillResult = await fillExternalApplicationPage({
      page,
      discovery,
      answerPlan,
    });
    const postFillDiscovery = fillResult.advanced
      ? await inspectExternalApplicationPage(page, args.url)
      : null;
    const postFillPageText = fillResult.advanced ? await extractExternalPageText(page) : null;
    const finalStage = postFillPageText
      ? /thanks for completing this form|thank you for applying/i.test(postFillPageText)
        ? "completed"
        : postFillDiscovery?.fields.length
          ? "form_step"
          : fillResult.primaryAction === "next"
            ? "final_submit_step"
            : "unknown"
      : fillResult.primaryAction === "submit"
        ? "final_submit_step"
        : "form_step";

    return {
      mode: args.mode,
      sourceUrl: args.url,
      candidateProfile: {
        fullName: candidateProfile.fullName,
        linkedinUrl: candidateProfile.linkedinUrl,
        resumePath: candidateProfile.sourceMetadata.resumePath ?? null,
      },
      discovery,
      fillResult,
      postFillDiscovery,
      answerPlan,
      recommendedAction,
      pageTextSample: truncate(finalPageText, 2500),
      postFillPageTextSample: postFillPageText ? truncate(postFillPageText, 2500) : null,
      finalStage,
      aiAdvisory: aiAdvisory
        ? {
            text: aiAdvisory.text,
            provider: aiAdvisory.provider,
            model: aiAdvisory.model,
          }
        : null,
      stopReason:
        discovery.fields.length > 0
          ? finalStage === "final_submit_step"
            ? `Filled ${fillResult.fieldResults.filter((result) => result.status === "filled").length} field(s) and reached the final submit step without submitting.`
            : finalStage === "completed"
              ? "Observed a completion page after filling the form."
              : `Discovered ${discovery.fields.length} external application field(s), filled what was possible, and stopped without submitting.`
          : "No application fields were discovered on the target page.",
    };
  });

  const reportPath = await persistRunArtifact({
    category: "external-apply-runs",
    prefix: args.mode,
    payload: result,
    deps,
  });

  deps.logger.info(
    {
      sourceUrl: args.url,
      platform: result.discovery.platform,
      fieldCount: result.discovery.fields.length,
      followedPrecursorLink: result.discovery.followedPrecursorLink,
    },
    "External application dry run finished",
  );

  return {
    ...result,
    reportPath,
  };
}
