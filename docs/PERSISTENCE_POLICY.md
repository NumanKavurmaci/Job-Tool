# Persistence Policy

This project stores three different kinds of runtime information, and they should not all be treated the same way.

## Durable State

Keep these in SQLite/Prisma because later flows actively depend on them:

- `JobPosting`
- `ApplicationDecision`
- `JobRecommendation`
- `JobReviewHistory`
- `AnswerCacheEntry`
- `PreparedAnswerSet` when survey answer reuse matters

Recommendation records are outcome-driven durable state:

- `explore` persists recommendation records for evaluated jobs so the recommendation catalog can track both recommended and not-recommended outcomes.
- `explore-batch` does the same at batch scale.
- `apply-batch` now also persists a `JobRecommendation` when a job evaluates to `APPLY`, even if the job later continues through an external LinkedIn application path.

## Debugging Evidence

Keep full run detail in JSON artifacts and file logs:

- run summaries
- batch summaries
- external handoff details
- step-by-step apply diagnostics
- site feedback snapshots

This data is valuable, but it does not need relational storage.

## Database Telemetry

Only persist database-backed system logs for events that are operationally important:

- `WARN`
- `ERROR`
- explicit audit events

Routine `INFO` progress messages should stay in the regular logger and artifacts so the database remains focused on durable state and anomalies.
