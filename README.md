# Job Tool

Job Tool is a TypeScript-based job scraping and parsing project. It opens a job posting URL with Playwright, extracts structured job content, sends a cleaned prompt to OpenAI for normalization, and stores the result in SQLite through Prisma.

## Current Scope

The project currently supports:

- Adapter-based extraction
- Greenhouse extraction
- Lever extraction
- Generic fallback extraction for unsupported sites
- LinkedIn coverage through the generic fallback path
- OpenAI-based structured parsing
- Prisma and SQLite persistence
- Automated tests with enforced coverage thresholds

## Tech Stack

- TypeScript
- Playwright
- OpenAI API
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
  llm/
    client.ts
  parser/
    extractJobText.ts
    formatJobForLLM.ts
    parseJobWithLLM.ts
  utils/
    logger.ts
prisma/
  schema.prisma
  migrations/
tests/
  adapters/
  browser/
  config/
  db/
  llm/
  parser/
  utils/
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. Fill in your `.env` file:

```env
OPENAI_API_KEY=your_key_here
DATABASE_URL="file:./dev.db"
```

3. Generate the Prisma client:

```bash
npx prisma generate
```

## Run

Run the tool with a job posting URL:

```bash
npm run dev -- "https://job-link-here"
```

## Extraction Flow

The extraction pipeline works in this order:

1. Resolve an adapter from the job URL
2. Extract structured fields from the page
3. Build a cleaner LLM input from extracted sections
4. Parse normalized job data with OpenAI
5. Save the final result to SQLite

The extracted fields currently include:

- Title
- Company
- Location
- Platform
- Apply URL
- Current URL
- Description text
- Requirements text
- Benefits text
- Raw page text

## Supported Adapters

### Greenhouse

Greenhouse pages use the dedicated `GreenhouseAdapter`.

### Lever

Lever pages use the dedicated `LeverAdapter`.

### Generic Fallback

Any unsupported job URL falls back to `GenericAdapter` so the pipeline keeps working.

### LinkedIn

LinkedIn does not yet have a dedicated adapter. Right now LinkedIn URLs are handled through the generic fallback path, and this behavior is covered by dedicated tests.

## Testing

Run the full test suite with coverage:

```bash
npm test
```

Run tests in watch mode:

```bash
npm run test:watch
```

The project enforces minimum coverage thresholds:

- 80% statements
- 80% branches
- 80% functions
- 80% lines

Current coverage is above the required threshold.

## Notes

- `headless: false` is currently enabled in the Playwright helper so browser actions remain visible during development.
- With `DATABASE_URL="file:./dev.db"`, Prisma may create the SQLite database under `prisma/dev.db`.
- You must replace the placeholder OpenAI key in `.env` before running the full workflow.
- LinkedIn support is currently tested through the generic fallback path, not through a dedicated adapter.
