# Task Guide

This guide tells an AI or maintainer which files to open first for common tasks.

## If You Need To...

### Add or change a CLI command

Open in this order:
- [src/app/cli.ts](../src/app/cli.ts)
- [src/app/main.ts](../src/app/main.ts)
- matching flow file under [src/app/flows/](../src/app/flows)

### Debug LinkedIn auth or page extraction

Open in this order:
- [src/adapters/LinkedInAdapter.ts](../src/adapters/LinkedInAdapter.ts)
- [src/browser/playwright.ts](../src/browser/playwright.ts)
- [tests/adapters/adapters.test.ts](../tests/adapters/adapters.test.ts)

### Debug LinkedIn apply behavior

Open in this order:
- [src/app/flows/linkedinApplyShared.ts](../src/app/flows/linkedinApplyShared.ts)
- [src/linkedin/easyApply.ts](../src/linkedin/easyApply.ts)
- [src/linkedin/playwrightEasyApplyDriver.ts](../src/linkedin/playwrightEasyApplyDriver.ts)

### Debug external application behavior

Open in this order:
- [src/app/flows/externalApplyFlows.ts](../src/app/flows/externalApplyFlows.ts)
- [src/external/discovery.ts](../src/external/discovery.ts)
- [src/external/semantics.ts](../src/external/semantics.ts)
- [src/external/fill.ts](../src/external/fill.ts)

Focus areas inside this corridor:
- precursor and bridge-page resolution
- embedded application surfaces inside iframes
- delayed SPA/embed mounts that need rediscovery retries
- progression detection after `Next` or `Submit`

Open these tests right after the source files:
- [tests/external/discovery.test.ts](../tests/external/discovery.test.ts)
- [tests/external/fill.test.ts](../tests/external/fill.test.ts)
- [tests/app/flows/externalApplyFlows.test.ts](../tests/app/flows/externalApplyFlows.test.ts)

### Change answer resolution

Open in this order:
- [src/answers/resolveAnswer.ts](../src/answers/resolveAnswer.ts)
- [src/questions/strategies/deterministic.ts](../src/questions/strategies/deterministic.ts)
- [src/questions/strategies/resumeAware.ts](../src/questions/strategies/resumeAware.ts)
- [src/questions/strategies/generated.ts](../src/questions/strategies/generated.ts)
- [src/questions/strategies/aiFallback.ts](../src/questions/strategies/aiFallback.ts)
- [src/questions/strategies/aiCorrection.ts](../src/questions/strategies/aiCorrection.ts)

### Change candidate data or profile logic

Open in this order:
- [src/profile/candidate.ts](../src/profile/candidate.ts)
- [src/candidate/buildMasterProfile.ts](../src/candidate/buildMasterProfile.ts)
- [src/candidate/types.ts](../src/candidate/types.ts)
- local data in `user/profile.json`

### Change scoring or policy behavior

Open in this order:
- [src/scoring/scoreJob.ts](../src/scoring/scoreJob.ts)
- [src/scoring/scoreJobWithAi.ts](../src/scoring/scoreJobWithAi.ts)
- [src/scoring/decision.ts](../src/scoring/decision.ts)
- [src/policy/policyEngine.ts](../src/policy/policyEngine.ts)

### Change persistence, artifacts, or dashboard-facing outputs

Open in this order:
- [src/app/observability.ts](../src/app/observability.ts)
- [src/utils/jobHistory.ts](../src/utils/jobHistory.ts)
- [src/utils/jobPersistence.ts](../src/utils/jobPersistence.ts)
- [src/utils/runReports.ts](../src/utils/runReports.ts)

### Debug why an external page says "No fields discovered"

Open in this order:
- [src/external/discovery.ts](../src/external/discovery.ts)
- [tests/external/discovery.test.ts](../tests/external/discovery.test.ts)

Check these patterns before assuming the site is unsupported:
- precursor CTA was not followed
- apply surface lives inside an iframe
- apply iframe is server-rendered in raw HTML but not yet visible in DOM
- apply surface is delayed by JS mount and needs retry time

## Reading Strategy For AI

Do not start with the largest file by default.

Preferred order:
1. Read [docs/FUNCTION_INDEX.md](../docs/FUNCTION_INDEX.md)
2. Read this task guide
3. Open only the one or two files named for the task
4. Open the matching tests from [docs/TEST_FILE_MAP.md](../docs/TEST_FILE_MAP.md)

That usually keeps the first pass under a few hundred lines instead of a few thousand.
