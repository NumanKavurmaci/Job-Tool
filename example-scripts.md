# Example Scripts

Practical PowerShell examples for every supported CLI mode.

## Shared Local LM Studio Setup

Use these env vars before any local-model command:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
```

Optional local timeout override for slower resume/job parsing:

```powershell
$env:LOCAL_LLM_TIMEOUT_MS='120000'
```

Optional Playwright visibility / session reuse:

```powershell
$env:PLAYWRIGHT_SLOW_MO_MS='250'
$env:LINKEDIN_SESSION_STATE_PATH='.auth/linkedin-session.json'
$env:LINKEDIN_BROWSER_PROFILE_PATH='.auth/linkedin-profile'
```

## Job Analysis Commands

Score a job posting:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
npm run dev -- score "https://job-link-here"
```

Generate the final decision for a job posting:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
npm run dev -- decide "https://job-link-here"
```

## Candidate Profile Commands

Build the candidate master profile from a resume and LinkedIn URL:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
npm run dev -- build-profile --resume "./Numan Kavurmacı March 2026 CV Resume.pdf" --linkedin "https://linkedin.com/in/your-handle"
```

If the default CV is already in the project root, omit `--resume`:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
npm run dev -- build-profile --linkedin "https://linkedin.com/in/your-handle"
```

## Question Answering Commands

Prepare answers from a questions JSON file:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
npm run dev -- answer-questions --resume "./Numan Kavurmacı March 2026 CV Resume.pdf" --questions "./questions.json"
```

With LinkedIn URL included:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
npm run dev -- answer-questions --resume "./Numan Kavurmacı March 2026 CV Resume.pdf" --linkedin "https://linkedin.com/in/your-handle" --questions "./questions.json"
```

Example `questions.json`:

```json
[
  { "label": "LinkedIn Profile", "inputType": "text" },
  {
    "label": "Do you require sponsorship?",
    "inputType": "radio",
    "options": ["Yes", "No"]
  },
  {
    "label": "How many years of experience do you have with React?",
    "inputType": "text"
  },
  { "label": "Why are you interested in this role?", "inputType": "textarea" }
]
```

## LinkedIn Easy Apply Dry Run

Dry run one specific LinkedIn Easy Apply job:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
npm run dev -- easy-apply-dry-run "https://www.linkedin.com/jobs/view/1234567890"
```

Dry run the default Easy Apply collection:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
npm run dev -- easy-apply-dry-run
```

Dry run a batch of 10 jobs from the default collection:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
npm run dev -- easy-apply-dry-run 10
```

Dry run a specific collection URL:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
npm run dev -- easy-apply-dry-run "https://www.linkedin.com/jobs/collections/easy-apply" 10
```

Dry run with a custom score threshold:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
npm run dev -- easy-apply-dry-run --score-threshold 60 10
```

Dry run with AI evaluation disabled:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
npm run dev -- easy-apply-dry-run --disable-ai-evaluation 10
```

## LinkedIn Easy Apply Live Commands

Run the real Easy Apply flow for a single LinkedIn job:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
npm run dev -- easy-apply "https://www.linkedin.com/jobs/view/1234567890"
```

Run the live batch flow from the default collection:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
npm run dev -- easy-apply-batch 5
```

Run the live batch flow from a specific collection:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
npm run dev -- easy-apply-batch "https://www.linkedin.com/jobs/collections/easy-apply" 5
```

Run the live batch flow with a custom threshold:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
npm run dev -- easy-apply-batch --score-threshold 60 5
```

Run the live batch flow with AI evaluation disabled:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
npm run dev -- easy-apply-batch --disable-ai-evaluation 5
```

## Print Full JSON Results

Print the default dry-run result object:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
@'
import { main, appDeps } from "./src/index.ts";
try {
  const result = await main(["easy-apply-dry-run"], appDeps);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await appDeps.prisma.$disconnect();
}
'@ | npx tsx -
```

Print a single-job dry-run result:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
@'
import { main, appDeps } from "./src/index.ts";
try {
  const result = await main(["easy-apply-dry-run", "https://www.linkedin.com/jobs/view/1234567890"], appDeps);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await appDeps.prisma.$disconnect();
}
'@ | npx tsx -
```

Print a dry-run batch result:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
@'
import { main, appDeps } from "./src/index.ts";
try {
  const result = await main(["easy-apply-dry-run", "10"], appDeps);
  console.log(JSON.stringify(result.easyApply, null, 2));
} finally {
  await appDeps.prisma.$disconnect();
}
'@ | npx tsx -
```

Print a live batch result:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
@'
import { main, appDeps } from "./src/index.ts";
try {
  const result = await main(["easy-apply-batch", "10"], appDeps);
  console.log(JSON.stringify(result.easyApply, null, 2));
} finally {
  await appDeps.prisma.$disconnect();
}
'@ | npx tsx -
```

## Session Reuse

Reuse explicit LinkedIn session/profile paths:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
$env:LINKEDIN_SESSION_STATE_PATH='.auth/linkedin-session.json'
$env:LINKEDIN_BROWSER_PROFILE_PATH='.auth/linkedin-profile'
npm run dev -- easy-apply-dry-run 5
```

## Tests

Run the default test suite:

```powershell
npm test
```

Run tests in watch mode:

```powershell
npm run test:watch
```

Run live LM Studio integration tests:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
npm run test:local-llm
```

## Notes

- `easy-apply` accepts a single LinkedIn job URL only.
- `easy-apply-batch` accepts LinkedIn collection URLs or the default collection.
- `easy-apply-dry-run` supports both single-job and collection/batch modes.
- If no URL is provided for batch-style Easy Apply commands, the default collection is:
  - `https://www.linkedin.com/jobs/collections/easy-apply`
- `--score-threshold` and `--disable-ai-evaluation` apply to batch commands.
- Dry run stops before the final submission click.
- Run reports are written under `artifacts/batch-runs`.
- If LinkedIn challenges authentication, inspect:
  - `logs/app.log`
  - `artifacts/screenshots`
