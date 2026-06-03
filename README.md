# Job Tool

🚀 `Job Tool` is a TypeScript-powered job evaluation and application workflow engine.

It helps you:

- 🔎 read and parse job postings
- 🧠 score jobs against a reusable candidate profile
- ⭐ explore LinkedIn collections and save recommendations
- ✍️ prepare answers for application questions
- 🛡️ automate LinkedIn and external apply flows with safety gates

> Source-available under the [PolyForm Noncommercial 1.0.0](./LICENSE) license. Personal and non-commercial use are allowed. Commercial use is not allowed.

## ✨ What It Does

Job Tool combines three inputs:

- job posting data
- a reusable candidate profile
- resume-based candidate information

That lets the system decide whether a role is a fit, explain why, prepare application answers, and only continue when the configured rules allow it.

## 🧩 Highlights

- adapter-based job extraction
- OpenAI and local LM Studio support
- profile-aware scoring and policy filtering
- resume ingestion and candidate master profile building
- LinkedIn Easy Apply question classification and answer preparation
- external application discovery, answer planning, and form filling
- site-feedback capture and one-shot AI correction retries
- `explore` mode for single-job recommendation snapshots
- `explore-batch` mode for collection-based recommendation discovery
- `apply` mode for LinkedIn, ReactJobs, Ashby, and external application pages
- Prisma + SQLite persistence
- structured logs, JSON artifacts, and review history tracking
- test coverage with focused local and integration checks

## 🛠️ Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Create your local environment file

```bash
cp .env.example .env
```

### 3. Generate Prisma client and apply the schema

```bash
npx prisma generate
npx prisma migrate dev
```

### 4. Run a first command

```bash
npm run dev -- decide "https://job-link-here"
```

## ⚡ Common Commands

```bash
npm run dev -- decide "https://job-link-here"
npm run dev -- explore "https://job-link-here"
npm run dev -- dashboard --limit 5
npm run dev -- explore-batch "https://www.linkedin.com/jobs/collections/top-applicant" --count 25
npm run dev -- score "https://job-link-here"
npm run dev -- build-profile --resume "./cv.pdf" --linkedin "https://linkedin.com/in/your-handle"
npm run dev -- answer-questions --resume "./cv.pdf" --questions "./questions.json"
npm run dev -- apply-dry-run "https://www.linkedin.com/jobs/view/123"
npm run dev -- apply "https://www.linkedin.com/jobs/view/123"
npm run dev -- apply-dry-run "https://www.linkedin.com/jobs/collections/hiring-in-network" --count 10
npm run dev -- apply-batch "https://www.linkedin.com/jobs/collections/hiring-in-network" --count 10
npm run dev -- apply-dry-run "https://jobs.ashbyhq.com/ruby-labs/05254f35-7380-4e94-b780-91bde2469db9"
npm run dev -- apply-dry-run "https://jobs.ashbyhq.com/ruby-labs?workplaceType=Remote" --count 5
npm run dev -- apply-dry-run "https://example.com/apply"
npm run dev -- apply "https://example.com/apply"
```

ReactJobs detail pages can be scored directly, and their Workable application links can use the
existing external apply flow:

```powershell
npm run dev -- score "https://reactjobs.io/react-jobs/robusta/8446-senior-frontend-engineer-react-nextjs-octopus-by-rtg"
npm run dev -- apply-dry-run "https://reactjobs.io/react-jobs/robusta/8446-senior-frontend-engineer-react-nextjs-octopus-by-rtg"
npm run dev -- apply-dry-run "https://apply.workable.com/robusta/j/6AA24D2C5C/apply/?ref=reactjobs.io"
npm run dev -- apply-dry-run "https://reactjobs.io/jobs/nextjs/remote?search=Nextjs&isRemote=true" --count 5
```

ReactJobs result pages are expanded into visible detail URLs before scoring and applying.
Ashby job detail pages are extracted directly, and Ashby listing pages are expanded into visible job detail URLs before scoring and applying.

## 🧠 Command Guide

- `dashboard`: prints a dashboard snapshot from persisted recommendations, reviews, and firm stats
- `explore`: evaluates one job and saves a recommendation snapshot without applying
- `explore-batch`: evaluates jobs from a LinkedIn collection and saves recommendation records without entering any apply flow
- `apply`: applies through LinkedIn, ReactJobs detail pages, Ashby job pages, or direct external application pages
- `apply-batch`: applies from supported LinkedIn collections, ReactJobs result pages, or Ashby listing pages

### Batch flags

- `--count <number>` controls how many jobs are processed
- `--score-threshold <number>` controls the minimum score required
- `--scoring local|ai` selects deterministic local scoring or direct LLM scoring
- `--disable-ai-evaluation` skips AI evaluation and processes matching jobs directly

### Explore flags

- `--count <number>` controls how many jobs are evaluated
- `--score-threshold <number>` controls which jobs become recommendations
- `--scoring local|ai` selects deterministic local scoring or direct LLM scoring
- `--disable-ai-evaluation` marks discovered jobs as recommended without extraction/scoring

### Dashboard flags

- `--limit <number>` controls how many recommendations and recent reviews are shown

### Scoring modes

- `--scoring local` uses the built-in deterministic scorer
- `--scoring ai` asks the configured LLM to produce the job score directly
- legacy `--ai-score-adjustment` still maps to `--scoring ai` for compatibility

### Apply behavior

- `apply-dry-run` explores the target, plans answers, fills what it can, captures feedback, and stops before final submit
- `apply` follows the same flow but may trigger the final submit action when the form is ready

### Legacy aliases

- `easy-apply`
- `easy-apply-batch`
- `easy-apply-dry-run`
- `external-apply`
- `external-apply-dry-run`

## ✅ Testing

### Full default suite

```bash
npm test
```

### Focused local checks

```bash
npm run type-check
npx vitest run tests/linkedin/easyApply.test.ts
npx vitest run tests/external/fill.test.ts
npx vitest run tests/questions/aiCorrection.test.ts
```

### Live LM Studio tests

```bash
npm run test:local-llm
```

The default suite does not require LM Studio or OpenAI access.

## 🔐 LinkedIn Notes

- saved browser session state is used from `.auth/linkedin-session.json`
- checkpoint or security pages stop the run with a specific auth error
- `LINKEDIN_MANUAL_AUTH_WINDOW_MS` controls the manual recovery window and defaults to 2 minutes
- dry run always stops before final submit
- site-visible feedback can trigger a one-shot AI repair attempt

## 📚 Documentation

The docs in [docs/README.md](./docs/README.md) are the source of truth for navigation and responsibility mapping.

### User-local profile files

- [user/profile.example.json](./user/profile.example.json): tracked starter profile
- `user/profile.json`: local personal override loaded first when present
- `user/resume.pdf`: optional default resume file

### AI-first navigation docs

- [docs/README.md](./docs/README.md)
- [docs/ROOT_FILE_MAP.md](./docs/ROOT_FILE_MAP.md)
- [docs/SOURCE_FILE_MAP.md](./docs/SOURCE_FILE_MAP.md)
- [docs/FUNCTION_INDEX.md](./docs/FUNCTION_INDEX.md)
- [docs/TASK_GUIDE.md](./docs/TASK_GUIDE.md)
- [docs/TEST_FILE_MAP.md](./docs/TEST_FILE_MAP.md)
- [docs/PRISMA_FILE_MAP.md](./docs/PRISMA_FILE_MAP.md)

## 📄 License

This project is source-available under the [PolyForm Noncommercial 1.0.0](./LICENSE) license.
You can inspect, study, and use it for personal or other non-commercial purposes.
Commercial use is not permitted without separate permission from the copyright holder.
