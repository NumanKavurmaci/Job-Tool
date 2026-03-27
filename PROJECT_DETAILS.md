# Project Details

## Overview

Job Tool is a TypeScript-based job scraping, parsing, scoring, and application-preparation project for job postings. It opens a job URL with Playwright, extracts structured content, sends a cleaned prompt to a selected LLM provider, normalizes the result, scores the job against a candidate profile, applies policy rules, and stores both the job and decision in SQLite through Prisma. It can also ingest a resume, attach a LinkedIn URL, build a reusable candidate master profile, and prepare answers for Easy Apply style questions before any real submission happens.

## Current Scope

The project currently supports:

- Adapter-based extraction
- Greenhouse extraction
- Lever extraction
- Generic fallback extraction for unsupported sites
- OpenAI-based parsing
- LM Studio local parsing
- Candidate-profile-based scoring and decisioning
- Policy-based rejection rules
- Resume ingestion from `.pdf`, `.docx`, `.md`, and `.txt`
- Candidate master profile generation
- LinkedIn URL support inside the candidate profile
- Question classification for Easy Apply style prompts
- Deterministic, resume-derived, generated, and AI-fallback answer strategies
- Prepared answer set persistence
- Prisma and SQLite persistence
- Automated tests with enforced coverage thresholds
- LinkedIn Easy Apply dry-run behavior that stops before final submission
- Multi-job LinkedIn Easy Apply collection crawling
- Fit-gated LinkedIn crawling that only attempts jobs with a final `APPLY` decision
- LinkedIn session reuse through persisted Playwright storage state
- Explicit LinkedIn auth challenge detection
- Skipping already-applied LinkedIn jobs

## Tech Stack

- TypeScript
- Playwright
- OpenAI API
- LM Studio
- Prisma
- SQLite
- Pino
- Vitest

## Project Structure

```text
src/
  index.ts
  adapters/
  answers/
  browser/
  candidate/
  config/
  db/
  domain/
  linkedin/
  llm/
  materials/
  parser/
  policy/
  profile/
  questions/
  scoring/
  utils/
prisma/
tests/
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. Fill in your `.env` file.

3. Generate the Prisma client:

```bash
npx prisma generate
```

4. Apply the database schema:

```bash
npx prisma migrate dev
```

## LLM Modes

### OpenAI mode

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=your_key_here
DATABASE_URL="file:./dev.db"
```

Optional:

```env
OPENAI_MODEL=gpt-4.1-mini
```

### Local mode with LM Studio

```env
LLM_PROVIDER=local
LOCAL_LLM_BASE_URL=http://127.0.0.1:1234/v1
LOCAL_LLM_MODEL=openai/gpt-oss-20b
DATABASE_URL="file:./dev.db"
```

### LinkedIn auth and session settings

```env
LINKEDIN_USERNAME=your_email@example.com
LINKEDIN_PASSWORD=your_password
LINKEDIN_SESSION_STATE_PATH=.auth/linkedin-session.json
```

`LINKEDIN_SESSION_STATE_PATH` is optional. When omitted, the default path above is used.

## LM Studio Setup

1. Start LM Studio.
2. Load a local model that can follow JSON instructions reliably.
3. Start the local server.
4. Make sure the server is reachable at the configured `LOCAL_LLM_BASE_URL`.
5. Set `LLM_PROVIDER=local` in `.env`.

When the app starts, it logs which provider is active.

## Run

Run the tool with a job posting URL:

```bash
npm run dev -- "https://job-link-here"
```

Run score mode:

```bash
npm run dev -- score "https://job-link-here"
```

Run decide mode:

```bash
npm run dev -- decide "https://job-link-here"
```

Build a candidate profile from a resume file and LinkedIn URL:

```bash
npm run dev -- build-profile --resume "./cv.pdf" --linkedin "https://linkedin.com/in/your-handle"
```

Prepare answers for a JSON file of application questions:

```bash
npm run dev -- answer-questions --resume "./cv.pdf" --linkedin "https://linkedin.com/in/your-handle" --questions "./questions.json"
```

Run a LinkedIn Easy Apply dry run:

```bash
npm run dev -- easy-apply-dry-run "https://www.linkedin.com/jobs/view/123"
```

Run a real Easy Apply flow for one specific LinkedIn job:

```bash
npm run dev -- easy-apply "https://www.linkedin.com/jobs/view/123"
```

Run a batch dry run from the default Easy Apply collection:

```bash
npm run dev -- easy-apply-dry-run 10
```

Run a batch dry run from a specific collection URL:

```bash
npm run dev -- easy-apply-dry-run "https://www.linkedin.com/jobs/collections/easy-apply" 10
```

The current CLI only supports batch processing in dry-run mode. `easy-apply` is reserved for a single LinkedIn job URL and will reject collection URLs.

## Pipelines

### Job pipeline

1. Resolve an extraction adapter from the job URL
2. Extract structured fields from the page
3. Build a cleaned LLM prompt
4. Route parsing through the selected LLM provider
5. Validate the model response with the shared schema
6. Normalize the parsed data
7. Score the job
8. Apply policy rules
9. Save the job and decision to SQLite

### Candidate/application pipeline

1. Read the resume file
2. Extract resume text
3. Parse the resume into structured JSON
4. Normalize the result into a candidate master profile
5. Attach the provided LinkedIn URL
6. Classify each application question
7. Choose the safest answer strategy
8. Save the candidate snapshot and prepared answers to SQLite

### LinkedIn Easy Apply dry run

1. Open the job page
2. Reuse persisted LinkedIn session state when available
3. Authenticate if needed
4. Open the Easy Apply flow
5. Skip prefilled static fields when LinkedIn already has values
6. Fill deterministic and resume-derived answers where safe
7. Use AI fallback only where needed
8. Advance through `Next` and `Review`
9. Stop before final submit

### LinkedIn Easy Apply live run

1. Open one LinkedIn job URL
2. Reuse persisted LinkedIn session state when available
3. Authenticate if needed
4. Open the Easy Apply flow
5. Fill deterministic, resume-derived, and AI-fallback answers
6. Advance through `Next`, `Review`, and `Submit`
7. Dismiss the LinkedIn post-submit modal when it appears

This path is intentionally limited to a single job URL in the CLI.

### LinkedIn batch Easy Apply dry run

1. Open the Easy Apply collection page
2. Reuse persisted LinkedIn session state when available
3. Discover visible LinkedIn job cards
4. Skip jobs that already show the LinkedIn applied badge
5. Evaluate each discovered job through:
   - extraction
   - parse
   - normalize
   - score
   - policy
   - decision
6. Only keep jobs with a final `APPLY` decision
7. Paginate with LinkedIn collection navigation when needed
8. Run the Easy Apply dry-run flow on approved jobs only
9. Stop when the requested count is reached or no more eligible jobs remain

## Candidate Profile

The candidate master profile combines:

- resume data
- LinkedIn URL
- normalized experience, education, projects, and skills
- manual candidate preferences and overrides

It includes structured fields such as:

- contact information
- location
- current title
- years of experience
- preferred roles and tech stack
- salary expectations
- experience overrides
- work authorization and sponsorship preferences
- education
- projects

## Resume Support

Supported formats:

- `.pdf`
- `.docx`
- `.md`
- `.txt`

## Question Answering

Supported question categories include:

- contact info
- LinkedIn
- location
- work authorization
- sponsorship
- relocation
- salary
- GPA
- years of experience
- skill experience
- education
- availability
- motivation short text
- general short text
- unknown

Strategies:

- `deterministic`
- `resume-derived`
- `generated`

When deterministic and resume-derived logic cannot answer safely, the system now uses an AI fallback grounded in the candidate profile and resume instead of stopping at a manual-review dead end.

## Persistence

Key persisted models include:

- `JobPosting`
- `ApplicationDecision`
- `CandidateProfileSnapshot`
- `PreparedAnswerSet`

## Questions File Format

`answer-questions` expects a JSON array like this:

```json
[
  {
    "label": "LinkedIn Profile",
    "inputType": "text"
  },
  {
    "label": "Do you require sponsorship?",
    "inputType": "radio",
    "options": ["Yes", "No"]
  },
  {
    "label": "How many years of experience do you have with React?",
    "inputType": "text"
  },
  {
    "label": "Why are you interested in this role?",
    "inputType": "textarea"
  }
]
```

## Testing

### Default test suite

```bash
npm test
```

This suite:

- uses mocks for external providers
- does not require LM Studio to be running
- does not require the OpenAI API to be reachable
- is the required success path for normal development

### Watch mode

```bash
npm run test:watch
```

### Live LM Studio integration tests

```bash
npm run test:local-llm
```

This suite:

- is separate from the default suite
- requires LM Studio to be running locally
- uses the configured local model

Coverage thresholds:

- 80% statements
- 80% branches
- 80% functions
- 80% lines

The current suite also covers:

- LinkedIn auth login-wall handling
- LinkedIn auth challenge classification
- session-state-aware browser setup
- multi-job Easy Apply batch selection
- already-applied LinkedIn job skipping
- fit-gated LinkedIn Easy Apply behavior

## Troubleshooting

### Local provider is not responding

- Confirm LM Studio is open
- Confirm the local server is started
- Confirm `LOCAL_LLM_BASE_URL` matches the running server
- Confirm `LOCAL_LLM_MODEL` matches the loaded model

### Local provider returns invalid JSON

- Use a model that follows JSON instructions reliably
- Check the parse logs for the failure reason

### OpenAI mode fails on startup

- Confirm `LLM_PROVIDER=openai`
- Confirm `OPENAI_API_KEY` is present

### Local mode fails on startup

- Confirm `LLM_PROVIDER=local`
- Confirm both `LOCAL_LLM_BASE_URL` and `LOCAL_LLM_MODEL` are present

### LinkedIn stops at a checkpoint or security verification page

- This means LinkedIn challenged the session
- The app now reports this explicitly as a LinkedIn auth challenge
- Complete the verification manually in the browser, then rerun so the saved session state can be reused

### LinkedIn keeps asking for login

- Confirm `LINKEDIN_USERNAME` and `LINKEDIN_PASSWORD` are set together
- Confirm the session file path is writable
- Delete the saved session file and retry if the session is stale

## Notes

- Playwright currently runs with `headless: false`
- Local and OpenAI parsing use the same prompt contract and schema
- Deterministic answers do not call the LLM
- Questions that previously became manual review now go through an AI fallback answer path
- LinkedIn Easy Apply support is still being hardened through live dry runs
- The current flow classifies and skips already-applied jobs before evaluation/application
- The driver includes support for dismissing LinkedIn post-submit recommendation modals for future non-dry-run flows
