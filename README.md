# Job Tool

Job Tool is a TypeScript project for evaluating jobs, preparing applications, and automating LinkedIn application workflows with strong safety checks.

This repository is proprietary and not licensed for public or commercial use; see [PROPRIETARY.md](./PROPRIETARY.md).

It can:

- extract job data from supported platforms
- parse job descriptions with OpenAI or LM Studio
- score jobs against a candidate profile
- prepare reusable answers for application questions
- evaluate LinkedIn jobs before attempting them
- walk through LinkedIn Easy Apply and external application flows without blindly submitting

## Core Idea

The project combines three main inputs:

- job postings
- a reusable candidate profile
- resume-based candidate data

That lets the system decide whether a role is a fit, prepare safe answers, and only attempt applications that pass the configured gates.

## Main Features

- adapter-based job extraction
- OpenAI and local LM Studio support
- user-profile-based scoring and policy rules
- resume ingestion and candidate master profile building
- LinkedIn Easy Apply question classification and answer preparation
- external application discovery, answer planning, and form filling
- site-feedback capture from LinkedIn and external application flows
- AI fallback for unresolved questions
- AI-guided one-shot correction retries when a site rejects a field value
- `easy-apply` mode for native LinkedIn Easy Apply only
- `apply` mode for LinkedIn apply plus optional external continuation
- Prisma + SQLite persistence
- JSON artifacts, structured logs, and review-history tracking
- automated tests with coverage enforcement

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Copy and fill your environment file:

```bash
cp .env.example .env
```

3. Generate Prisma client and apply the database schema:

```bash
npx prisma generate
npx prisma migrate dev
```

4. Run the project:

```bash
npm run dev -- decide "https://job-link-here"
```

## Common Commands

```bash
npm run dev -- decide "https://job-link-here"
npm run dev -- score "https://job-link-here"
npm run dev -- build-profile --resume "./cv.pdf" --linkedin "https://linkedin.com/in/your-handle"
npm run dev -- answer-questions --resume "./cv.pdf" --questions "./questions.json"
npm run dev -- easy-apply "https://www.linkedin.com/jobs/view/123" --dry-run
npm run dev -- easy-apply "https://www.linkedin.com/jobs/view/123"
npm run dev -- easy-apply-batch --count 5 --dry-run
npm run dev -- easy-apply-batch "https://www.linkedin.com/jobs/collections/easy-apply" --count 5
npm run dev -- apply "https://www.linkedin.com/jobs/view/123" --dry-run
npm run dev -- apply "https://www.linkedin.com/jobs/view/123"
npm run dev -- apply-batch "https://www.linkedin.com/jobs/collections/hiring-in-network" --count 10 --dry-run
npm run dev -- apply-batch "https://www.linkedin.com/jobs/collections/hiring-in-network" --count 10
npm run dev -- external-apply "https://example.com/apply" --dry-run
npm run dev -- external-apply "https://example.com/apply"
```

## Command Semantics

`easy-apply` means LinkedIn Easy Apply only.

`easy-apply-batch` is the Easy Apply-only batch command and defaults to [LinkedIn Easy Apply jobs](https://www.linkedin.com/jobs/collections/easy-apply) when no URL is provided.

`apply` is the all-apply surface for LinkedIn jobs. It can detect external handoff cases, continue into the external site, capture site feedback, and retry one corrected value when the site rejects an answer.

`apply-batch` is the all-apply batch command for LinkedIn collection URLs.

All batch commands support:
- `--count <number>` to control how many approved jobs are processed
- `--score-threshold <number>` to control the minimum score required before a job is attempted
- `--disable-ai-evaluation` to skip pre-application AI evaluation and process matching jobs directly

`external-apply --dry-run` discovers the page, plans answers, fills what it can, captures site feedback, and stops before the terminal submission.

`external-apply` runs the same flow but is allowed to trigger the final external form submit action when the page reaches a submit step.

Legacy aliases still parse:
- `easy-apply-dry-run`
- `apply-dry-run`
- `external-apply-dry-run`

## Testing

Default test suite:

```bash
npm test
```

Focused local checks:

```bash
npm run type-check
npx vitest run tests/linkedin/easyApply.test.ts
npx vitest run tests/external/fill.test.ts
npx vitest run tests/questions/aiCorrection.test.ts
```

Live LM Studio integration tests:

```bash
npm run test:local-llm
```

The default suite does not require LM Studio or OpenAI access.

## LinkedIn Notes

- The LinkedIn flow uses saved browser session state by default at `.auth/linkedin-session.json`.
- If LinkedIn shows a checkpoint or security verification page, the run stops with a specific auth error instead of a vague failure.
- The manual LinkedIn recovery window is configurable with `LINKEDIN_MANUAL_AUTH_WINDOW_MS` and now defaults to 2 minutes.
- Dry run still stops before the final submit action.
- Site-visible feedback is captured in run results and can trigger a one-shot AI repair attempt for rejected field values.

## Documentation

The docs in [docs/README.md](./docs/README.md) are the source of truth for file navigation and responsibility mapping.

User-local profile data lives under [user/](./user):
- [user/profile.example.json](./user/profile.example.json) is the tracked generic starter file
- `user/profile.json` is the local personal override loaded first when present
- `user/resume.pdf` or another supported resume file can act as the default resume

AI-first file navigation docs are in:
- [docs/README.md](./docs/README.md)
- [docs/ROOT_FILE_MAP.md](./docs/ROOT_FILE_MAP.md)
- [docs/SOURCE_FILE_MAP.md](./docs/SOURCE_FILE_MAP.md)
- [docs/TEST_FILE_MAP.md](./docs/TEST_FILE_MAP.md)
- [docs/PRISMA_FILE_MAP.md](./docs/PRISMA_FILE_MAP.md)
