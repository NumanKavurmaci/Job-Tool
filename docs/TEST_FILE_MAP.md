# Test File Map

This file maps all test files to the behavior they protect.

## Root tests

- [tests/index.test.ts](../tests/index.test.ts): Thin entrypoint/export smoke test.
- [tests/example.spec.ts](../tests/example.spec.ts): Generic/example test file. Low signal compared with the rest of the suite.

## `tests/app/`

- [tests/app/main.test.ts](../tests/app/main.test.ts): Main orchestration test suite for CLI parsing, flows, persistence, and error wrapping.

## `tests/adapters/`

- [tests/adapters/adapters.test.ts](../tests/adapters/adapters.test.ts): Core adapter behavior, especially LinkedIn extraction/auth cases.
- [tests/adapters/helpers.test.ts](../tests/adapters/helpers.test.ts): Shared adapter helper coverage.
- [tests/adapters/resolver.test.ts](../tests/adapters/resolver.test.ts): Adapter resolution by URL/domain.

## `tests/answers/`

- [tests/answers/cache.test.ts](../tests/answers/cache.test.ts): Answer cache persistence behavior.
- [tests/answers/helpers.test.ts](../tests/answers/helpers.test.ts): Small answer helper behavior.
- [tests/answers/resolveAnswer.test.ts](../tests/answers/resolveAnswer.test.ts): End-to-end answer resolution strategy selection.

## `tests/browser/`

- [tests/browser/playwright.test.ts](../tests/browser/playwright.test.ts): Browser launch/session-state/persistent-profile behavior.

## `tests/candidate/`

- [tests/candidate/buildMasterProfile.test.ts](../tests/candidate/buildMasterProfile.test.ts): Candidate master profile construction.
- [tests/candidate/defaultResume.test.ts](../tests/candidate/defaultResume.test.ts): Default resume path detection assumptions.
- [tests/candidate/extractResumeText.test.ts](../tests/candidate/extractResumeText.test.ts): Resume text extraction by file format.
- [tests/candidate/linkedin.test.ts](../tests/candidate/linkedin.test.ts): Candidate LinkedIn normalization helpers.
- [tests/candidate/loadCandidateProfile.test.ts](../tests/candidate/loadCandidateProfile.test.ts): Candidate profile loading behavior.
- [tests/candidate/normalizeResume.test.ts](../tests/candidate/normalizeResume.test.ts): Resume normalization behavior.
- [tests/candidate/parseResume.test.ts](../tests/candidate/parseResume.test.ts): Resume parsing behavior and schema expectations.

## `tests/config/`

- [tests/config/env.test.ts](../tests/config/env.test.ts): Environment parsing and defaults.

## `tests/dashboard/`

- `tests/dashboard/`: Currently an empty placeholder directory matching the unused `src/dashboard/` folder.

## `tests/db/`

- [tests/db/client.test.ts](../tests/db/client.test.ts): Prisma client instantiation.

## `tests/domain/`

- [tests/domain/job.test.ts](../tests/domain/job.test.ts): Job normalization and domain inference rules.

## `tests/fixtures/`

- [tests/fixtures/linkedin.ts](../tests/fixtures/linkedin.ts): Realistic LinkedIn HTML fixtures reused by tests.

## `tests/linkedin/`

- [tests/linkedin/easyApply.test.ts](../tests/linkedin/easyApply.test.ts): Easy Apply engine logic and batch behavior.
- [tests/linkedin/playwrightEasyApplyDriver.test.ts](../tests/linkedin/playwrightEasyApplyDriver.test.ts): Playwright-backed LinkedIn Easy Apply driver behavior.

## `tests/live/`

- [tests/live/lmStudio.live.test.ts](../tests/live/lmStudio.live.test.ts): Real provider-backed integration tests. Expected to be more brittle than unit tests.

## `tests/llm/`

- [tests/llm/completePrompt.test.ts](../tests/llm/completePrompt.test.ts): Generic prompt completion orchestration.
- [tests/llm/json.test.ts](../tests/llm/json.test.ts): JSON extraction/cleanup helpers.
- [tests/llm/lmStudioProvider.test.ts](../tests/llm/lmStudioProvider.test.ts): LM Studio provider wrapper behavior.
- [tests/llm/openaiProvider.test.ts](../tests/llm/openaiProvider.test.ts): OpenAI provider wrapper behavior.
- [tests/llm/parseJob.test.ts](../tests/llm/parseJob.test.ts): Main job parse orchestration.
- [tests/llm/prompts.test.ts](../tests/llm/prompts.test.ts): Prompt content/shape coverage.
- [tests/llm/resolveProvider.test.ts](../tests/llm/resolveProvider.test.ts): Provider selection behavior.

## `tests/materials/`

- [tests/materials/generateShortAnswer.test.ts](../tests/materials/generateShortAnswer.test.ts): Generated short-answer behavior.

## `tests/parser/`

- [tests/parser/extractJobText.test.ts](../tests/parser/extractJobText.test.ts): Main extraction entrypoint behavior.
- [tests/parser/formatJobForLLM.test.ts](../tests/parser/formatJobForLLM.test.ts): LLM input formatting.
- [tests/parser/parseJobWithLLM.test.ts](../tests/parser/parseJobWithLLM.test.ts): Higher-level parser orchestration wrapper.

## `tests/policy/`

- [tests/policy/policyEngine.test.ts](../tests/policy/policyEngine.test.ts): Policy acceptance/rejection rules.

## `tests/profile/`

- [tests/profile/candidate.test.ts](../tests/profile/candidate.test.ts): Manual candidate profile loader behavior.

## `tests/questions/`

- [tests/questions/aiFallback.test.ts](../tests/questions/aiFallback.test.ts): AI fallback answer behavior.
- [tests/questions/classifyQuestion.test.ts](../tests/questions/classifyQuestion.test.ts): Question classifier behavior.
- [tests/questions/strategies.test.ts](../tests/questions/strategies.test.ts): Cross-strategy answer behavior.

## `tests/scoring/`

- [tests/scoring/decision.test.ts](../tests/scoring/decision.test.ts): Score-to-decision mapping.
- [tests/scoring/scoreJob.test.ts](../tests/scoring/scoreJob.test.ts): Main scoring behavior and breakdown logic.

## `tests/utils/`

- [tests/utils/errors.test.ts](../tests/utils/errors.test.ts): `AppError` and serialization behavior.
- [tests/utils/fakePage.ts](../tests/utils/fakePage.ts): Shared page test double for LinkedIn/browser tests.
- [tests/utils/jobHistory.test.ts](../tests/utils/jobHistory.test.ts): Review history persistence helpers.
- [tests/utils/logger.test.ts](../tests/utils/logger.test.ts): Logger surface smoke test.
- [tests/utils/runReports.test.ts](../tests/utils/runReports.test.ts): Run report writing and terminal summary helpers.
- [tests/utils/systemLog.test.ts](../tests/utils/systemLog.test.ts): DB-backed system log helper behavior.
