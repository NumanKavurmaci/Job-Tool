# 🧪 Example Scripts

Copyable PowerShell examples for running the engine through `npx tsx -`.

Use these when you want the same behavior as the CLI, but with explicit environment setup and a guaranteed Prisma disconnect at the end of the run.

## 🔧 Shared Local Model Setup

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
```

Optional tuning:

```powershell
$env:LOCAL_LLM_TIMEOUT_MS='120000'
$env:PLAYWRIGHT_SLOW_MO_MS='250'
$env:LINKEDIN_MANUAL_AUTH_WINDOW_MS='1800000'
```

## 🔎 Explore A LinkedIn Collection

Evaluates jobs and saves recommendations. Does not apply.

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
@'
import { main, appDeps } from "./src/index.ts";

try {
  const result = await main([
    "explore-batch",
    "https://www.linkedin.com/jobs/collections/top-applicant",
    "--count",
    "50",
    "--score-threshold",
    "45",
    "--scoring",
    "ai",
  ], appDeps);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await appDeps.prisma.$disconnect();
}
'@ | npx tsx -
```

## 🧯 Dry-Run Apply Batch

Evaluates and rehearses the apply path, but keeps final submission disabled.

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
@'
import { main, appDeps } from "./src/index.ts";

try {
  const result = await main([
    "apply-batch",
    "https://www.linkedin.com/jobs/collections/easy-apply",
    "--count",
    "25",
    "--score-threshold",
    "40",
    "--resume",
    "./user/resume.pdf",
    "--scoring",
    "ai",
    "--dry-run",
  ], appDeps);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await appDeps.prisma.$disconnect();
}
'@ | npx tsx -
```

## ▶️ Live Apply Batch

Runs the same scored batch flow without `--dry-run`.

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
@'
import { main, appDeps } from "./src/index.ts";

try {
  const result = await main([
    "apply-batch",
    "https://www.linkedin.com/jobs/collections/easy-apply",
    "--count",
    "25",
    "--score-threshold",
    "40",
    "--resume",
    "./user/resume.pdf",
    "--scoring",
    "ai",
  ], appDeps);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await appDeps.prisma.$disconnect();
}
'@ | npx tsx -
```

## 🎯 Single Job Decision

Scores one job and records the decision.

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
    "--scoring",
    "ai",
  ], appDeps);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await appDeps.prisma.$disconnect();
}
'@ | npx tsx -
```

## 🌐 Single External Apply Dry Run

Useful for Ashby, Greenhouse, Lever, Workable, or generic application links.

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
@'
import { main, appDeps } from "./src/index.ts";

try {
  const result = await main([
    "external-apply",
    "https://apply.workable.com/company/j/ROLE_ID/apply/",
    "--resume",
    "./user/resume.pdf",
    "--dry-run",
  ], appDeps);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await appDeps.prisma.$disconnect();
}
'@ | npx tsx -
```

## 🔁 Resume An Incomplete Batch

Inspects the latest eligible batch report when no report is provided.

```powershell
$env:LLM_PROVIDER='local'
$env:LOCAL_LLM_BASE_URL='http://127.0.0.1:1234/v1'
$env:LOCAL_LLM_MODEL='openai/gpt-oss-20b'
@'
import { main, appDeps } from "./src/index.ts";

try {
  const result = await main([
    "resume-incomplete",
    "--report",
    "./artifacts/batch-runs/latest-apply-batch.json",
  ], appDeps);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await appDeps.prisma.$disconnect();
}
'@ | npx tsx -
```

## 📝 Notes

- `explore-batch` evaluates and saves recommendations without applying.
- `apply-batch --dry-run` rehearses the application path without final submit.
- `apply-batch` without `--dry-run` can submit applications when the engine reaches a ready state.
- `--scoring ai` uses the configured LLM provider.
- Redirect large JSON outputs to a file when reviewing long batch runs.
