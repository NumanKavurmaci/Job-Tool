# Job Tool

Job Tool is a TypeScript project for finding, parsing, scoring, and preparing applications for online job postings, with a strong focus on LinkedIn Easy Apply workflows.

It can:

- extract job data from supported platforms
- parse job descriptions with OpenAI or LM Studio
- score jobs against a candidate profile
- prepare reusable answers for application questions
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
- LinkedIn Easy Apply dry-run support that stops before final submit
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
```

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

## Documentation

Detailed project notes, architecture, workflows, provider setup, and troubleshooting are in [PROJECT_DETAILS.md](./PROJECT_DETAILS.md).
