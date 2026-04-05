# Test Strategy

This file explains how the suite is organized and which regressions must never lose coverage.

## Goals

- catch command-routing mistakes before live runs
- catch policy/mode mismatches before batch runs silently skip jobs
- catch external form-regression bugs before they appear in production pages
- keep docs and tests aligned so a future AI reader can find the right guardrail quickly

## Test Layers

1. Unit tests
- pure helpers
- normalizers
- policy rules
- semantic inference
- small answer-resolution strategies

2. Flow integration tests
- CLI arg parsing into flow mode
- `main()` routing to the correct flow module
- shared LinkedIn orchestration behavior
- shared external apply orchestration behavior
- persistence and observability side effects

3. DOM/driver regression tests
- LinkedIn fixtures
- external form fixtures
- discovery/fill behavior on realistic HTML snapshots
- browser-driver edge cases that are too expensive to verify with live runs alone

4. Live tests
- provider-backed or real-site checks
- used sparingly because they are slower and more brittle
- never the only protection for a bug we already understand

## Critical Regressions

These scenarios should always have explicit tests.

### Mode separation

- `easy-apply` and `easy-apply-batch` must stay Easy Apply only.
- `apply` and `apply-batch` must allow LinkedIn jobs that hand off to external applications.
- A regression here causes high-score jobs to be skipped with the wrong reason.

Protected by:
- [tests/policy/policyEngine.test.ts](../tests/policy/policyEngine.test.ts)
- [tests/app/flowHelpers.test.ts](../tests/app/flowHelpers.test.ts)
- [tests/app/flows/easyApplyFlows.test.ts](../tests/app/flows/easyApplyFlows.test.ts)

### LinkedIn external handoff

- `apply` should continue into external apply.
- `easy-apply` should stop at external detection.
- successful live external completion should trigger the LinkedIn `Yes` confirmation modal handler.

Protected by:
- [tests/app/flows/easyApplyFlows.test.ts](../tests/app/flows/easyApplyFlows.test.ts)
- [tests/linkedin/playwrightEasyApplyDriver.test.ts](../tests/linkedin/playwrightEasyApplyDriver.test.ts)

### Batch pagination continuity

- after an approved job is processed, batch must restore collection context and continue pagination
- otherwise requested counts become meaningless because the bot remains on a direct job page

Protected by:
- [tests/linkedin/easyApply.test.ts](../tests/linkedin/easyApply.test.ts)

### Dry-run history must not block live runs

- dry-run `READY_TO_SUBMIT` / approved review history must not incorrectly suppress a later live apply

Protected by:
- [tests/utils/jobHistory.test.ts](../tests/utils/jobHistory.test.ts)
- [tests/app/flowHelpers.test.ts](../tests/app/flowHelpers.test.ts)

### External semantics and fill safety

- boolean/consent fields must not receive text answers
- salary groups must resolve as amount/currency/period
- city autocomplete, custom selects, and file upload fallbacks must stay covered
- site feedback must be captured when the page rejects the input

Protected by:
- [tests/external/semantics.test.ts](../tests/external/semantics.test.ts)
- [tests/external/discovery.test.ts](../tests/external/discovery.test.ts)
- [tests/external/fill.test.ts](../tests/external/fill.test.ts)
- [tests/questions/aiCorrection.test.ts](../tests/questions/aiCorrection.test.ts)

### External apply surface resolution

- bridge or listing pages must follow the real apply CTA
- embedded apply surfaces inside iframes must be discovered
- server-rendered iframe sources in raw HTML must still be usable when DOM queries miss them
- delayed JS mounts must get retry time before the run is marked as `no fields discovered`
- unrelated navigation links must not be misclassified as apply precursor links

Protected by:
- [tests/external/discovery.test.ts](../tests/external/discovery.test.ts)
- [tests/app/flows/externalApplyFlows.test.ts](../tests/app/flows/externalApplyFlows.test.ts)

## Rule Of Thumb

Whenever a live bug is found:

1. write or update a fixture if the bug depends on DOM structure
2. add a focused unit/flow regression test
3. add a mode/integration test if the bug crossed module boundaries
4. update this file or [TEST_FILE_MAP.md](../docs/TEST_FILE_MAP.md) when the bug exposes a new critical corridor
