# Job Tool

Job Tool is a TypeScript-based job scraping, parsing, scoring, and application-preparation project for job postings. It opens a job URL with Playwright, extracts structured content, sends a cleaned prompt to a selected LLM provider, normalizes the result, scores the job against a candidate profile, applies policy rules, and stores both the job and decision in SQLite through Prisma. It can also ingest a resume, attach a LinkedIn URL, build a reusable candidate master profile, and prepare answers for Easy Apply style questions before any real submission happens.

## Current Scope

The project currently supports:

- Adapter-based extraction
- Greenhouse extraction
- Lever extraction
- Generic fallback extraction for unsupported sites
- LinkedIn coverage through the generic fallback path
- OpenAI-based parsing
- LM Studio local parsing
- Candidate-profile-based scoring and decisioning
- Policy-based rejection rules
- Resume ingestion from `.pdf`, `.docx`, `.md`, and `.txt`
- Candidate master profile generation
- LinkedIn URL support inside the candidate profile
- Question classification for Easy Apply style prompts
- Deterministic, resume-derived, generated, and manual-review answer strategies
- Prepared answer set persistence
- Prisma and SQLite persistence
- Automated tests with enforced coverage thresholds

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
    types.ts
    helpers.ts
    GenericAdapter.ts
    GreenhouseAdapter.ts
    LeverAdapter.ts
    resolveAdapter.ts
  browser/
    playwright.ts
  config/
    env.ts
  db/
    client.ts
  domain/
    job.ts
  candidate/
    types.ts
    loadCandidateProfile.ts
    buildMasterProfile.ts
    linkedin.ts
    resume/
      extractResumeText.ts
      parseResume.ts
      normalizeResume.ts
  llm/
    types.ts
    prompts.ts
    completePrompt.ts
    parseJob.ts
    schema.ts
    providers/
      openaiProvider.ts
      lmStudioProvider.ts
      resolveProvider.ts
  answers/
    types.ts
    answerBank.ts
    confidence.ts
    resolveAnswer.ts
  questions/
    types.ts
    normalizeQuestion.ts
    classifyQuestion.ts
    strategies/
      deterministic.ts
      resumeAware.ts
      generated.ts
      manualReview.ts
  materials/
    generateShortAnswer.ts
  parser/
    extractJobText.ts
    formatJobForLLM.ts
    parseJobWithLLM.ts
  policy/
    policyEngine.ts
  profile/
    candidate.ts
  scoring/
    scoreJob.ts
    decision.ts
  utils/
    logger.ts
prisma/
  schema.prisma
  migrations/
tests/
  adapters/
  answers/
  browser/
  candidate/
  config/
  domain/
  live/
  llm/
  materials/
  parser/
  policy/
  profile/
  questions/
  scoring/
  utils/
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

## LM Studio Setup

1. Start LM Studio.
2. Load a local model that can follow JSON instructions reliably.
3. Start the local server.
4. Make sure the server is reachable at the configured `LOCAL_LLM_BASE_URL`.
5. Set `LLM_PROVIDER=local` in `.env`.

When the app starts, it logs which provider is active, for example:

- `Using LLM provider: openai (gpt-4.1-mini)`
- `Using LLM provider: local (openai/gpt-oss-20b)`

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

## Pipeline

The current pipeline works in this order:

1. Resolve an extraction adapter from the job URL
2. Extract structured fields from the page
3. Build a cleaned LLM prompt
4. Route parsing through the selected LLM provider
5. Validate the model response with the shared `ParsedJobSchema`
6. Normalize the parsed data
7. Score the job
8. Apply policy rules
9. Save the job and decision to SQLite

The application-preparation pipeline works in this order:

1. Read the resume file
2. Extract resume text
3. Parse the resume into structured JSON
4. Normalize the result into a candidate master profile
5. Attach the provided LinkedIn URL
6. Classify each application question
7. Choose the safest answer strategy
8. Save the candidate snapshot and prepared answers to SQLite

## Candidate Profile

The candidate master profile combines:

- resume data
- LinkedIn URL
- normalized experience, education, projects, and skills
- candidate preferences already used by the scoring engine

The generated profile includes structured fields such as:

- contact information
- location
- current title
- years of experience
- preferred roles and tech stack
- skills and languages
- work authorization and sponsorship preferences
- experience timeline
- education
- projects

This profile becomes the reusable source of truth for application preparation.

## Resume Support

Phase 5 supports these resume formats:

- `.pdf`
- `.docx`
- `.md`
- `.txt`

The resume pipeline extracts raw text first, then parses it through the shared LLM layer, and finally normalizes the result into a stable candidate profile shape.

## Question Answering

The question engine supports these categories:

- contact info
- LinkedIn
- location
- work authorization
- sponsorship
- relocation
- salary
- years of experience
- skill experience
- education
- availability
- motivation short text
- general short text
- unknown

Each question is routed through one of these strategies:

- `deterministic`
- `resume-derived`
- `generated`
- `needs-review`

Each resolved answer includes:

- the detected question type
- the chosen strategy
- the answer payload
- a numeric confidence score
- a confidence label: `high`, `medium`, `low`, or `manual_review`
- the answer source

The system intentionally does not force an answer when confidence is too low. In those cases it returns a manual-review result instead of guessing.

## Persistence

Phase 5 adds two new persistence models:

- `CandidateProfileSnapshot`
- `PreparedAnswerSet`

This allows the project to keep:

- the structured candidate profile used at the time of preparation
- the original question set
- the generated answers

That history is useful before moving on to any future real apply automation.

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

## Supported Adapters

### Greenhouse

Greenhouse pages use the dedicated `GreenhouseAdapter`.

### Lever

Lever pages use the dedicated `LeverAdapter`.

### Generic fallback

Any unsupported job URL falls back to `GenericAdapter` so the pipeline keeps working.

### LinkedIn

LinkedIn does not yet have a dedicated adapter. Right now LinkedIn URLs are handled through the generic fallback path, and this behavior is covered by dedicated tests.

## Testing

### Default test suite

Run the default test suite with coverage:

```bash
npm test
```

This suite:

- uses mocks for external providers
- does not require LM Studio to be running
- does not require the OpenAI API to be reachable
- is the required success path for CI and everyday development
- covers the resume, question classification, answer strategy, and application-preparation flows

### Watch mode

Run tests in watch mode:

```bash
npm run test:watch
```

### Live LM Studio integration tests

Run the real LM Studio integration tests:

```bash
npm run test:local-llm
```

This suite:

- is separate from the default suite
- requires LM Studio to be running locally
- uses `http://127.0.0.1:1234/v1`
- uses the configured local model such as `openai/gpt-oss-20b`
- is intended for manual verification of the real local provider path

The live suite uses a dedicated Vitest config in [vitest.live.config.ts](./vitest.live.config.ts), while the default suite excludes `*.live.test.ts` files.

The project enforces minimum coverage thresholds:

- 80% statements
- 80% branches
- 80% functions
- 80% lines

Current coverage is above the required threshold.

## Troubleshooting

### Local provider is not responding

- Confirm LM Studio is open.
- Confirm the local server is started.
- Confirm `LOCAL_LLM_BASE_URL` matches the running server.
- Confirm the selected local model name matches `LOCAL_LLM_MODEL`.
- If you are using the live suite, remember that `npm run test:local-llm` requires LM Studio to be available.

### Local provider returns invalid JSON

- Use a more reliable instruction-following model.
- Keep the prompt unchanged so both providers share the same contract.
- Check the `llm.parse.failed` logs for the validation or JSON parsing reason.

### OpenAI mode fails on startup

- Confirm `LLM_PROVIDER=openai`.
- Confirm `OPENAI_API_KEY` is present.

### Local mode fails on startup

- Confirm `LLM_PROVIDER=local`.
- Confirm both `LOCAL_LLM_BASE_URL` and `LOCAL_LLM_MODEL` are present.

### `npm run test:local-llm` says no tests were found

- Confirm the script is using the dedicated live config in `vitest.live.config.ts`.
- Confirm the live tests are located under `tests/live/`.
- Confirm you are running `npm run test:local-llm`, not `npm test`.

## Notes

- `headless: false` is currently enabled in the Playwright helper so browser actions remain visible during development.
- With `DATABASE_URL="file:./dev.db"`, Prisma may create the SQLite database under `prisma/dev.db`.
- Local and OpenAI parsing both use the same prompt builder and the same `ParsedJobSchema`.
- Resume parsing and short-answer generation both reuse the same provider abstraction introduced in Phase 4.
- Deterministic answers do not call the LLM; the LLM is used only where the flow actually needs it.
- LinkedIn support is currently tested through the generic fallback path, not through a dedicated adapter.
- The default test suite and the live LM Studio suite are intentionally separate so local API availability never blocks normal test success.
