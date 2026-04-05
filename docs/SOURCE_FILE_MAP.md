# Source File Map

This file maps all `src/` files to their purpose.

## `src/`

- [src/index.ts](../src/index.ts): Thin entrypoint and public re-export surface.

## `src/app/`

- [src/app/cli.ts](../src/app/cli.ts): CLI argument parsing and validation.
- [src/app/constants.ts](../src/app/constants.ts): Application-wide CLI/session constants and LinkedIn defaults.
- [src/app/deps.ts](../src/app/deps.ts): Dependency container used by orchestration and tests.
- [src/app/flowHelpers.ts](../src/app/flowHelpers.ts): Shared helpers for profile loading, answer resolution, and batch job evaluation.
- [src/app/main.ts](../src/app/main.ts): Top-level orchestration for `main()` and `runCli()`.
- [src/app/observability.ts](../src/app/observability.ts): Run artifacts, DB system logs, and DB review-history persistence helpers.

## `src/app/flows/`

- [src/app/flows/jobFlow.ts](../src/app/flows/jobFlow.ts): `score` and `decide` job-analysis flow.
- [src/app/flows/profileFlows.ts](../src/app/flows/profileFlows.ts): `build-profile` and `answer-questions` orchestration.
- [src/app/flows/linkedinFlows.ts](../src/app/flows/linkedinFlows.ts): Easy Apply-only public flow surface for single-job and batch LinkedIn runs.
- [src/app/flows/applyFlows.ts](../src/app/flows/applyFlows.ts): All-apply public flow surface that can continue from LinkedIn into external applications.
- [src/app/flows/linkedinApplyShared.ts](../src/app/flows/linkedinApplyShared.ts): Shared LinkedIn orchestration, persistence, external handoff, and observability helpers.
- [src/app/flows/externalApplyFlows.ts](../src/app/flows/externalApplyFlows.ts): External application dry-run/live orchestration, precursor-link routing, persistence, and artifact writing.

## `src/adapters/`

- [src/adapters/types.ts](../src/adapters/types.ts): Shared adapter interfaces and extracted job shapes.
- [src/adapters/helpers.ts](../src/adapters/helpers.ts): Small extraction helpers reused by multiple adapters.
- [src/adapters/resolveAdapter.ts](../src/adapters/resolveAdapter.ts): Chooses the correct adapter for a URL.
- [src/adapters/GenericAdapter.ts](../src/adapters/GenericAdapter.ts): Generic fallback extractor for unsupported job sites.
- [src/adapters/GreenhouseAdapter.ts](../src/adapters/GreenhouseAdapter.ts): Greenhouse-specific extraction logic.
- [src/adapters/LeverAdapter.ts](../src/adapters/LeverAdapter.ts): Lever-specific extraction logic.
- [src/adapters/LinkedInAdapter.ts](../src/adapters/LinkedInAdapter.ts): LinkedIn-specific page extraction plus LinkedIn auth handling.

## `src/answers/`

- [src/answers/types.ts](../src/answers/types.ts): Shared answer result types.
- [src/answers/answerBank.ts](../src/answers/answerBank.ts): Deterministic canned answer content.
- [src/answers/cache.ts](../src/answers/cache.ts): Database-backed answer cache utilities for reusing previously answered questions.
- [src/answers/confidence.ts](../src/answers/confidence.ts): Confidence label helpers.
- [src/answers/resolveAnswer.ts](../src/answers/resolveAnswer.ts): Main answer resolution pipeline across all strategies.

## `src/browser/`

- [src/browser/playwright.ts](../src/browser/playwright.ts): Shared Playwright launcher, persistent profile support, and browser/session wiring.
- [src/browser/siteFeedback.ts](../src/browser/siteFeedback.ts): Shared types and merge helpers for site-visible errors, warnings, and info messages.

## `src/candidate/`

- [src/candidate/types.ts](../src/candidate/types.ts): Candidate master profile types.
- [src/candidate/linkedin.ts](../src/candidate/linkedin.ts): LinkedIn profile normalization/extraction helpers for candidate data.
- [src/candidate/loadCandidateProfile.ts](../src/candidate/loadCandidateProfile.ts): Loads the richer master profile used in applications.
- [src/candidate/buildMasterProfile.ts](../src/candidate/buildMasterProfile.ts): Builds a structured master profile from resume + optional LinkedIn data.

## `src/candidate/resume/`

- [src/candidate/resume/extractResumeText.ts](../src/candidate/resume/extractResumeText.ts): Reads `.pdf`, `.docx`, `.md`, and `.txt` resume text.
- [src/candidate/resume/normalizeResume.ts](../src/candidate/resume/normalizeResume.ts): Normalizes parsed resume JSON into stable internal shapes.
- [src/candidate/resume/parseResume.ts](../src/candidate/resume/parseResume.ts): LLM-backed structured resume parsing.

## `src/config/`

- [src/config/env.ts](../src/config/env.ts): Environment loading, defaults, and validation.

## `src/dashboard/`

- `src/dashboard/`: Currently an empty placeholder directory. No active production code lives here.

## `src/db/`

- [src/db/client.ts](../src/db/client.ts): Shared Prisma client instance.
- [src/db/runtimeGuard.ts](../src/db/runtimeGuard.ts): Guards runtime DB setup assumptions before Prisma-backed flows proceed.

## `src/domain/`

- [src/domain/job.ts](../src/domain/job.ts): Job normalization, field inference, and domain-level cleanup logic.

## `src/linkedin/`

- [src/linkedin/easyApply.ts](../src/linkedin/easyApply.ts): Provider-agnostic Easy Apply step engine and batch runner logic.
- [src/linkedin/playwrightEasyApplyDriver.ts](../src/linkedin/playwrightEasyApplyDriver.ts): Playwright-backed implementation of the Easy Apply driver interface.

## `src/llm/`

- [src/llm/types.ts](../src/llm/types.ts): Shared LLM provider and parse result types.
- [src/llm/schema.ts](../src/llm/schema.ts): Job parsing schema contract.
- [src/llm/json.ts](../src/llm/json.ts): JSON extraction and cleanup helpers.
- [src/llm/prompts.ts](../src/llm/prompts.ts): Prompt templates for parsing and generation tasks.
- [src/llm/completePrompt.ts](../src/llm/completePrompt.ts): Generic prompt-completion wrapper.
- [src/llm/parseJob.ts](../src/llm/parseJob.ts): Main job parsing pipeline over the selected provider.

## `src/llm/providers/`

- [src/llm/providers/resolveProvider.ts](../src/llm/providers/resolveProvider.ts): Chooses the configured provider implementation.
- [src/llm/providers/lmStudioProvider.ts](../src/llm/providers/lmStudioProvider.ts): LM Studio/OpenAI-compatible local provider implementation.
- [src/llm/providers/openaiProvider.ts](../src/llm/providers/openaiProvider.ts): OpenAI provider implementation.

## `src/materials/`

- [src/materials/generateCoverLetter.ts](../src/materials/generateCoverLetter.ts): Generates page-aware cover letters using visible job/application context.
- [src/materials/generateShortAnswer.ts](../src/materials/generateShortAnswer.ts): Generates concise free-text answers for short application prompts.

## `src/external/`

- [src/external/discovery.ts](../src/external/discovery.ts): External application page discovery, bridge-page resolution, embedded iframe surface detection, delayed retry logic, and answer planning.
- [src/external/fill.ts](../src/external/fill.ts): External form field filling, primary-action detection, and step advancement.
- [src/external/types.ts](../src/external/types.ts): Shared external application discovery/planning types.

## `src/parser/`

- [src/parser/extractJobText.ts](../src/parser/extractJobText.ts): Adapter-driven job extraction entrypoint.
- [src/parser/formatJobForLLM.ts](../src/parser/formatJobForLLM.ts): Converts extracted job content into LLM input.
- [src/parser/parseJobWithLLM.ts](../src/parser/parseJobWithLLM.ts): Legacy/simple orchestration wrapper around LLM job parsing.

## `src/policy/`

- [src/policy/policyEngine.ts](../src/policy/policyEngine.ts): Hard policy filters like location, seniority, and apply constraints.

## `src/profile/`

- [src/profile/candidate.ts](../src/profile/candidate.ts): Loads the manual candidate preference profile used for scoring/policy.

## `src/questions/`

- [src/questions/types.ts](../src/questions/types.ts): Question classification and normalized question types.
- [src/questions/classifyQuestion.ts](../src/questions/classifyQuestion.ts): Rule-based question type classifier.
- [src/questions/normalizeQuestion.ts](../src/questions/normalizeQuestion.ts): Label/input normalization before strategy selection.

## `src/questions/strategies/`

- [src/questions/strategies/deterministic.ts](../src/questions/strategies/deterministic.ts): Rule-based answers for contact info, sponsorship, salary, etc.
- [src/questions/strategies/resumeAware.ts](../src/questions/strategies/resumeAware.ts): Resume/profile-derived answers for structured questions.
- [src/questions/strategies/generated.ts](../src/questions/strategies/generated.ts): Short-answer generation strategy.
- [src/questions/strategies/aiFallback.ts](../src/questions/strategies/aiFallback.ts): Last-resort LLM grounded answer strategy.
- [src/questions/strategies/aiCorrection.ts](../src/questions/strategies/aiCorrection.ts): LLM-driven retry strategy that repairs a rejected field value using site feedback.
- [src/questions/strategies/manualReview.ts](../src/questions/strategies/manualReview.ts): Explicit manual-review fallback behavior.

## `src/scoring/`

- [src/scoring/scoreJob.ts](../src/scoring/scoreJob.ts): Fit scoring logic and score breakdown.
- [src/scoring/scoreJobWithAi.ts](../src/scoring/scoreJobWithAi.ts): Optional AI-assisted score adjustment layered on top of the deterministic baseline.
- [src/scoring/decision.ts](../src/scoring/decision.ts): Maps score into `APPLY`, `MAYBE`, or `SKIP`.

## `src/utils/`

- [src/utils/artifacts.ts](../src/utils/artifacts.ts): Screenshot and HTML snapshot artifact utilities.
- [src/utils/errors.ts](../src/utils/errors.ts): Shared `AppError`, serialization, and user-facing error formatting.
- [src/utils/jobHistory.ts](../src/utils/jobHistory.ts): Low-level DB persistence and lookup helpers for review history.
- [src/utils/jobPersistence.ts](../src/utils/jobPersistence.ts): Job posting upsert/refresh helpers and detected-applied persistence logic.
- [src/utils/logger.ts](../src/utils/logger.ts): Pino logger to stdout and `logs/app.log`.
- [src/utils/runReports.ts](../src/utils/runReports.ts): Writes JSON run reports and formats terminal batch summaries.
- [src/utils/systemLog.ts](../src/utils/systemLog.ts): Low-level DB persistence for structured system logs.
