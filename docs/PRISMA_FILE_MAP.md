# Prisma File Map

This file explains the database-related files.

## Core Prisma Files

- [prisma/schema.prisma](../prisma/schema.prisma): Source of truth for the Prisma data model.
- [prisma/dev.db](../prisma/dev.db): Active SQLite database used by Prisma locally.
- [prisma/migration_lock.toml](../prisma/migration_lock.toml): Prisma migration lock metadata.
- [prisma/migrations/migration_lock.toml](../prisma/migrations/migration_lock.toml): Prisma migration folder lock metadata.

## Current Important Models

Defined in [prisma/schema.prisma](../prisma/schema.prisma):
- `JobPosting`: Canonical job record keyed by URL.
- `ApplicationDecision`: Saved scoring/policy decision for a job.
- `CandidateProfileSnapshot`: Persisted candidate master profile snapshot.
- `PreparedAnswerSet`: Persisted prepared question/answer bundle.
- `SystemLog`: DB-backed structured system logs.
- `JobReviewHistory`: Append-only history for viewed/reviewed/evaluated job URLs.

## Migration Files

- [prisma/migrations/20260327124000_init/migration.sql](../prisma/migrations/20260327124000_init/migration.sql): Initial Prisma database setup.
- [prisma/migrations/20260327131500_phase3_scoring_policy/migration.sql](../prisma/migrations/20260327131500_phase3_scoring_policy/migration.sql): Scoring/policy-era schema additions.
- [prisma/migrations/20260327143000_phase5_candidate_profiles_and_answers/migration.sql](../prisma/migrations/20260327143000_phase5_candidate_profiles_and_answers/migration.sql): Candidate profile and prepared answer persistence additions.
- [prisma/migrations/20260329110000_phase6_observability_history/migration.sql](../prisma/migrations/20260329110000_phase6_observability_history/migration.sql): DB-backed observability and job review history additions.
