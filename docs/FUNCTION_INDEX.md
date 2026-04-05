# Function Index

This file is the fast-entry function map for the highest-signal modules.

Use it when you want to answer:
- which function owns a workflow?
- where should I debug a specific failure?
- which file do I open first without reading the entire module?

It is intentionally task-oriented instead of exhaustive prose.

## Best Starting Points

- CLI command routing: [src/app/main.ts](../src/app/main.ts)
- LinkedIn apply orchestration: [src/app/flows/linkedinApplyShared.ts](../src/app/flows/linkedinApplyShared.ts)
- External apply orchestration: [src/app/flows/externalApplyFlows.ts](../src/app/flows/externalApplyFlows.ts)
- External field discovery: [src/external/discovery.ts](../src/external/discovery.ts)
- External field semantics: [src/external/semantics.ts](../src/external/semantics.ts)
- External field filling: [src/external/fill.ts](../src/external/fill.ts)
- LinkedIn step engine: [src/linkedin/easyApply.ts](../src/linkedin/easyApply.ts)
- LinkedIn browser driver: [src/linkedin/playwrightEasyApplyDriver.ts](../src/linkedin/playwrightEasyApplyDriver.ts)
- Persistence and artifacts: [src/app/observability.ts](../src/app/observability.ts)

## Command Surface

### [src/app/main.ts](../src/app/main.ts)

- `main(argv, deps)`
  Decides which top-level flow to run for every CLI mode.
- `runCli(argv, deps)`
  CLI wrapper that prints results and formats fatal errors.

### [src/app/cli.ts](../src/app/cli.ts)

- `parseCliArgs(argv)`
  Parses command-line arguments into the validated `CliArgs` union.

## LinkedIn Orchestration

### [src/app/flows/linkedinFlows.ts](../src/app/flows/linkedinFlows.ts)

- `runLinkedInFlow(...)`
  Easy Apply-only single-job surface.
- `runLinkedInBatchFlow(...)`
  Easy Apply-only batch surface.

### [src/app/flows/applyFlows.ts](../src/app/flows/applyFlows.ts)

- `runApplyFlow(...)`
  All-apply single-job surface.
- `runApplyBatchFlow(...)`
  All-apply batch surface.

### [src/app/flows/linkedinApplyShared.ts](../src/app/flows/linkedinApplyShared.ts)

- `runLinkedInEasyApplyDryRunFlow(...)`
  Single LinkedIn Easy Apply dry-run entrypoint.
- `runLinkedInApplyDryRunFlow(...)`
  Single LinkedIn apply dry-run entrypoint with external handoff support.
- `runLinkedInEasyApplyFlow(...)`
  Live Easy Apply-only entrypoint.
- `runLinkedInApplyFlow(...)`
  Live all-apply entrypoint that can continue into external apply.
- `runLinkedInEasyApplyBatchFlow(...)`
  Easy Apply-only batch entrypoint.
- `runLinkedInApplyBatchFlow(...)`
  All-apply batch entrypoint.
- `createBatchEventObserver(...)`
  Centralized observer used to persist/log batch progress.
- `buildLinkedInSingleRunMeta(...)`
  Builds the JSON artifact metadata summary for single LinkedIn runs.
- `buildLinkedInBatchRunMeta(...)`
  Builds the JSON artifact metadata summary for batch LinkedIn runs.

## External Apply

### [src/app/flows/externalApplyFlows.ts](../src/app/flows/externalApplyFlows.ts)

- `runExternalApplyDryRunFlow(...)`
  Public dry-run external apply entrypoint.
- `runExternalApplyFlow(...)`
  Public live external apply entrypoint.
- `runExternalApplyCore(...)`
  Main orchestration loop:
  discovery -> precursor follow -> answer plan -> fill -> rediscovery -> persistence.
- `determineExternalFinalStage(...)`
  Converts page state into a coarse stage such as `form_step` or `completed`.
- `buildExternalStepSnapshot(...)`
  Saves one step worth of structured run history.
- `buildStopReason(...)`
  Produces the human-readable stop reason shown in reports and the dashboard.

### [src/external/discovery.ts](../src/external/discovery.ts)

- `discoverExternalApplication(page, url)`
  Opens the external page and returns the normalized discovery model.
- `inspectExternalApplicationPage(page, sourceUrl)`
  Re-reads the current page without changing navigation state.
- `extractExternalPageText(page)`
  Returns cleaned page text used for planning and diagnostics.
- `followExternalApplicationLink(page, sourceUrl, href)`
  Navigates to a precursor/apply link and re-inspects the result.
- `planExternalApplicationAnswers({ fields, candidateProfile, pageContext })`
  Produces an answer plan from semantics plus fallback answer strategies.
- `resolveSemanticExternalAnswer(...)`
  Local semantic resolver wrapper used before LLM fallback.
- `looksSyntheticFieldLabel(field)`
  Guards against trap-like or synthetic labels that should be left for manual review.

Important helper clusters in this file:
- precursor and bridge-page resolution
  Finds `Apply`, `Continue`, and similar CTA links without following unrelated navigation links.
- embedded application surface detection
  Detects application iframes from live DOM and from raw HTML when the iframe source is server-rendered before the DOM is stable.
- delayed mount retry loop
  Re-inspects empty shells after short waits so JS-mounted apply surfaces have time to appear.

### [src/external/semantics.ts](../src/external/semantics.ts)

- `analyzeFieldSemantics(field)`
  Central semantic classifier for external fields.
- `annotateSemanticFields(fields)`
  Attaches semantic keys, confidence, and select coercions to discovered fields.
- `resolveSemanticExternalAnswer({ field, candidateProfile, pageContext })`
  Structured resolver for salary, sponsorship, city, phone, portfolio, resume, and similar fields.

Important helper clusters in this file:
- salary helpers
  Convert structured profile salary data into amount/currency/period answers.
- sponsorship helpers
  Use regional authorization preferences and page context to answer visa questions.
- city and phone helpers
  Normalize city and phone data for multi-control forms such as separate country code widgets.

### [src/external/fill.ts](../src/external/fill.ts)

- `fillExternalApplicationPage({ page, discovery, answerPlan, candidateProfile, submit })`
  Main external field-filling routine for one step.
- `collectExternalSiteFeedback(page)`
  Reads visible errors plus browser-native validation messages from the page.
- `getExternalPrimaryAction(page)`
  Finds whether the step ends in `Next`, `Continue`, or `Submit`.
- `advanceExternalApplicationPage(page, action)`
  Clicks the primary action and waits for the page to settle.

Important helper clusters in this file:
- selector resolution
  Turns a discovered field into a prioritized locator list.
- control-specific filling
  Handles text, file, checkbox, select, react-select, and autocomplete flows.
- AI correction retry
  Attempts one repaired value when the page rejects a field value.

## LinkedIn Step Engine

### [src/linkedin/easyApply.ts](../src/linkedin/easyApply.ts)

- `runEasyApply(...)`
  Single LinkedIn Easy Apply engine.
- `runEasyApplyBatchInternal(...)`
  Shared batch engine used by higher-level LinkedIn flows.
- step/question helpers
  Convert raw LinkedIn steps into normalized questions, answers, and reports.

### [src/linkedin/playwrightEasyApplyDriver.ts](../src/linkedin/playwrightEasyApplyDriver.ts)

- `createPlaywrightEasyApplyDriver(...)`
  Browser-backed driver for LinkedIn Easy Apply.
- driver methods on the returned object
  Page reads, step reads, question extraction, answer entry, validation reads, and submit/next clicks.

## Job Evaluation and Persistence

### [src/app/flowHelpers.ts](../src/app/flowHelpers.ts)

- `loadMasterProfileForArgs(...)`
  Loads and merges resume/profile inputs for the current run.
- `evaluateOnPage(...)`
  Extracts, scores, and decides a job while already on an open page.
- `evaluateJobForBatch(...)`
  Batch-safe evaluation wrapper used before attempting apply.

### [src/app/observability.ts](../src/app/observability.ts)

- `persistRunArtifact(...)`
  Writes JSON artifact files.
- `persistSystemEvent(...)`
  Writes structured system logs.
- `persistBatchJobHistory(...)`
  Writes review history for batch job outcomes.

## Candidate and Answers

### [src/candidate/buildMasterProfile.ts](../src/candidate/buildMasterProfile.ts)

- `buildMasterProfile(...)`
  Merges manual profile, parsed resume, and optional LinkedIn data into one canonical candidate model.

### [src/answers/resolveAnswer.ts](../src/answers/resolveAnswer.ts)

- `resolveAnswer(...)`
  Runs the ordered answer strategy pipeline.

### [src/questions/strategies/aiCorrection.ts](../src/questions/strategies/aiCorrection.ts)

- `repairAnswerFromSiteFeedback(...)`
  Uses site feedback to produce one corrected answer candidate.

## How To Navigate By Task

- "Why did a LinkedIn batch stop?"
  Open [src/app/flows/linkedinApplyShared.ts](../src/app/flows/linkedinApplyShared.ts), then [src/app/observability.ts](../src/app/observability.ts), then the linked test file from [docs/TEST_FILE_MAP.md](../docs/TEST_FILE_MAP.md).

- "Why did an external application field fail?"
  Open [src/external/discovery.ts](../src/external/discovery.ts), [src/external/semantics.ts](../src/external/semantics.ts), then [src/external/fill.ts](../src/external/fill.ts).

- "Why did an external page show 0 fields?"
  Open [src/external/discovery.ts](../src/external/discovery.ts) first, then [tests/external/discovery.test.ts](../tests/external/discovery.test.ts). Focus on precursor CTA detection, iframe surface detection, raw HTML iframe fallback, and delayed-mount retries.

- "Why did a site say the value is invalid?"
  Open [src/external/fill.ts](../src/external/fill.ts) and [src/questions/strategies/aiCorrection.ts](../src/questions/strategies/aiCorrection.ts).

- "Where is salary / sponsorship / city / phone logic?"
  Open [src/external/semantics.ts](../src/external/semantics.ts).

- "Where are run reports built?"
  Open [src/app/observability.ts](../src/app/observability.ts) and [src/utils/runReports.ts](../src/utils/runReports.ts).
