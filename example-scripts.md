# Example Scripts

This file keeps only PowerShell `tsx` wrapper script examples.
All examples use the `main([...], appDeps)` pattern and print JSON output.

## Shared Setup

Use these local model settings before each script:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
```

Optional:

```powershell
$env:LOCAL_LLM_TIMEOUT_MS='120000'
$env:PLAYWRIGHT_SLOW_MO_MS='250'
$env:LINKEDIN_MANUAL_AUTH_WINDOW_MS='1800000'
```

## Dry Run Batch

Dry run 100 jobs from the Top Applicant collection:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
@'
import { main, appDeps } from "./src/index.ts";
try {
  const result = await main(["easy-apply-dry-run", "https://www.linkedin.com/jobs/collections/top-applicant", "100"], appDeps);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await appDeps.prisma.$disconnect();
}
'@ | npx tsx -
```

## Dry Run Batch With AI Score Adjustment

Enable AI score adjustment explicitly:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
@'
import { main, appDeps } from "./src/index.ts";
try {
  const result = await main([
    "easy-apply-dry-run",
    "https://www.linkedin.com/jobs/collections/top-applicant",
    "100",
    "--ai-score-adjustment",
  ], appDeps);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await appDeps.prisma.$disconnect();
}
'@ | npx tsx -
```

## Dry Run Batch With Custom Threshold

Custom score threshold example:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
@'
import { main, appDeps } from "./src/index.ts";
try {
  const result = await main([
    "easy-apply-dry-run",
    "https://www.linkedin.com/jobs/collections/top-applicant",
    "100",
    "--score-threshold",
    "40",
  ], appDeps);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await appDeps.prisma.$disconnect();
}
'@ | npx tsx -
```

## Single Job Decide

Final decision for one job:

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
@'
import { main, appDeps } from "./src/index.ts";
try {
  const result = await main([
    "decide",
    "https://www.linkedin.com/jobs/view/4389593314/",
  ], appDeps);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await appDeps.prisma.$disconnect();
}
'@ | npx tsx -
```

## Single Job Decide With AI Score Adjustment

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
@'
import { main, appDeps } from "./src/index.ts";
try {
  const result = await main([
    "decide",
    "https://www.linkedin.com/jobs/view/4389593314/",
    "--ai-score-adjustment",
  ], appDeps);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await appDeps.prisma.$disconnect();
}
'@ | npx tsx -
```

## Notes

- `easy-apply-dry-run` can be used with a single job URL or a collection URL.
- `--ai-score-adjustment` is optional. Without it, only deterministic scoring runs.
- Each script disconnects Prisma at the end.
- Large batch runs can print a lot of JSON. Redirecting output to a file can be easier.
