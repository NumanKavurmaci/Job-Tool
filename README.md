# Job Tool

Job Tool is a TypeScript project for evaluating jobs, preparing applications, and automating LinkedIn Easy Apply workflows with strong safety checks.

It can:

- extract job data from supported platforms
- parse job descriptions with OpenAI or LM Studio
- score jobs against a candidate profile
- prepare reusable answers for application questions
- evaluate LinkedIn Easy Apply jobs before attempting them
- walk through LinkedIn Easy Apply flows without submitting the final application

## Core Idea

The project combines three main inputs:

- job postings
- a reusable candidate profile
- resume-based candidate data

That lets the system decide whether a role is a fit and prepare safe, structured answers before any real submission.

## Main Features

- adapter-based job extraction
- OpenAI and local LM Studio support
- candidate-profile-based scoring and policy rules
- resume ingestion and candidate master profile building
- Easy Apply question classification and answer preparation
- AI fallback for questions that are not resolved deterministically
- LinkedIn Easy Apply dry-run support for single jobs and multi-job collection runs
- fit-gated LinkedIn crawling that only attempts jobs scored as `APPLY`
- LinkedIn session reuse through persisted Playwright storage state
- explicit detection of LinkedIn auth challenges and already-applied jobs
- Prisma + SQLite persistence
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
npm run dev -- easy-apply-dry-run "https://www.linkedin.com/jobs/view/123"
npm run dev -- easy-apply-dry-run
npm run dev -- easy-apply-dry-run 10
```

`easy-apply-dry-run` defaults to [LinkedIn Easy Apply jobs](https://www.linkedin.com/jobs/collections/easy-apply) when no URL is provided.

When a number is passed, the tool treats it as the target number of matching LinkedIn Easy Apply jobs to process from the default collection.

## Testing

Default test suite:

```bash
npm test
```

Live LM Studio integration tests:

```bash
npm run test:local-llm
```

The default suite does not require LM Studio or OpenAI access.

## LinkedIn Notes

- The LinkedIn flow uses saved browser session state by default at `.auth/linkedin-session.json`.
- If LinkedIn shows a checkpoint or security verification page, the run stops with a specific auth error instead of a vague failure.
- Dry run still stops before the final submit action.

## Documentation

Detailed architecture, workflows, LinkedIn auth behavior, provider setup, and troubleshooting are in `PROJECT_DETAILS.md`.
