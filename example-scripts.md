# Example Scripts

Practical PowerShell examples for common project workflows.

## Parse and Score a Job

Score a job posting:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
npm run dev -- score "https://job-link-here"
```

Decide whether a job should be applied to:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
npm run dev -- decide "https://job-link-here"
```

## Build Candidate Profile

Build the candidate master profile from a resume file and LinkedIn URL:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
npm run dev -- build-profile --resume "./Numan Kavurmacı March 2026 CV Resume.pdf" --linkedin "https://linkedin.com/in/your-handle"
```

If the default CV is already in the project root, you can omit `--resume`:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
npm run dev -- build-profile --linkedin "https://linkedin.com/in/your-handle"
```

## Answer Application Questions

Prepare answers from a questions JSON file:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
npm run dev -- answer-questions --resume "./Numan Kavurmacı March 2026 CV Resume.pdf" --questions "./questions.json"
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

Run a dry run for one specific Easy Apply job:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
npm run dev -- easy-apply-dry-run "https://www.linkedin.com/jobs/view/1234567890"
```

Run from the default LinkedIn Easy Apply collection:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
npm run dev -- easy-apply-dry-run
```

Run a batch dry run for 10 matching jobs from the default collection:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
npm run dev -- easy-apply-dry-run 10
```

Run a batch dry run against a specific LinkedIn collection URL:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
npm run dev -- easy-apply-dry-run "https://www.linkedin.com/jobs/collections/easy-apply" 10
```

Run a real Easy Apply flow for one specific LinkedIn job:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
npm run dev -- easy-apply "https://www.linkedin.com/jobs/view/1234567890"
```

## Print Full Dry Run JSON

Use this when you want the full result object in the terminal:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
@'
import { main, appDeps } from "./src/index.ts";
const result = await main(["easy-apply-dry-run"], appDeps);
console.log(JSON.stringify(result, null, 2));
await appDeps.prisma.$disconnect();
'@ | npx tsx -
```

Use a specific job URL instead of the default collection:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
@'
import { main, appDeps } from "./src/index.ts";
const result = await main(["easy-apply-dry-run", "https://www.linkedin.com/jobs/view/JOB_ID"], appDeps);
console.log(JSON.stringify(result, null, 2));
await appDeps.prisma.$disconnect();
'@ | npx tsx -
```

Print the full batch result for 10 jobs from the default collection:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
@'
import { main, appDeps } from "./src/index.ts";
const result = await main(["easy-apply-dry-run", "10"], appDeps);
console.log(JSON.stringify(result.easyApply, null, 2));
await appDeps.prisma.$disconnect();
'@ | npx tsx -
```

## LinkedIn Session Reuse

Use a dedicated saved LinkedIn session file:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
$env:LINKEDIN_SESSION_STATE_PATH='.auth/linkedin-session.json'
npm run dev -- easy-apply-dry-run 5
```

## Run Tests

Run the normal mocked test suite:

```powershell
npm test
```

Run the live LM Studio integration tests:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
npm run test:local-llm
```

## Useful Notes

- `easy-apply-dry-run` stops before final submission.
- `easy-apply` accepts a single LinkedIn job URL only.
- Collection/batch processing is currently exposed only through `easy-apply-dry-run`.
- The default Easy Apply root URL is `https://www.linkedin.com/jobs/collections/easy-apply`.
- In batch mode, the tool evaluates jobs first and only attempts jobs that score as `APPLY`.
- Already-applied LinkedIn jobs are skipped automatically.
- LinkedIn session state is persisted at `.auth/linkedin-session.json` by default.
- If LinkedIn returns a security verification challenge, the app now reports that explicitly.
- If a command fails right after dotenv output, that dotenv line is informational, not the actual error.
- If LM Studio is not running, local-provider commands will fail during LLM calls.
