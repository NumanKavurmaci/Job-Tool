# Job Tool

Job Tool is a TypeScript-based job scraping, parsing, scoring, and decisioning project for job postings. It opens a job URL with Playwright, extracts structured content, sends a cleaned prompt to a selected LLM provider, normalizes the result, scores the job against a candidate profile, applies policy rules, and stores both the job and decision in SQLite through Prisma.

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
  llm/
    types.ts
    prompts.ts
    parseJob.ts
    schema.ts
    providers/
      openaiProvider.ts
      lmStudioProvider.ts
      resolveProvider.ts
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
  browser/
  config/
  domain/
  live/
  llm/
  parser/
  policy/
  profile/
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
- LinkedIn support is currently tested through the generic fallback path, not through a dedicated adapter.
- The default test suite and the live LM Studio suite are intentionally separate so local API availability never blocks normal test success.
