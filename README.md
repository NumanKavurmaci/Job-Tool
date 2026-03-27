# Job Tool

A minimal job scraping and parsing tool. It opens a job posting URL, extracts the page text, parses it with OpenAI, and saves the result to a SQLite database.

## Tech Stack

- TypeScript
- Playwright
- OpenAI API
- Prisma
- SQLite
- Pino

## Project Structure

```text
src/
  index.ts
  config/
    env.ts
  utils/
    logger.ts
  db/
    client.ts
  browser/
    playwright.ts
  llm/
    client.ts
  parser/
    extractJobText.ts
    parseJobWithLLM.ts
prisma/
  schema.prisma
  migrations/
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

## What It Does

1. Opens the URL with Playwright
2. Extracts the page text
3. Parses the text into structured JSON with OpenAI
4. Saves the result to SQLite through Prisma

## Current Milestone

At this stage, the following flow is in place:

- Env loading
- Browser launch
- Text extraction from a page
- OpenAI parsing
- Prisma and SQLite persistence

## Notes

- `headless: false` is enabled for now, so you can watch the browser actions.
- When using `DATABASE_URL="file:./dev.db"`, Prisma may create the SQLite file under `prisma/dev.db`.
- You need to replace the placeholder OpenAI key in `.env` before running the full workflow.
