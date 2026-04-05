# AI Navigation Docs

This folder is the AI-first navigation layer for the project.

Its job is simple:
- help a reader understand where logic lives without reading code first
- reduce time spent searching through a growing codebase
- document file ownership and intent in a stable, searchable format

## Reading Order

1. [ROOT_FILE_MAP.md](../docs/ROOT_FILE_MAP.md)
2. [SOURCE_FILE_MAP.md](../docs/SOURCE_FILE_MAP.md)
3. [FUNCTION_INDEX.md](../docs/FUNCTION_INDEX.md)
4. [TASK_GUIDE.md](../docs/TASK_GUIDE.md)
5. [TEST_STRATEGY.md](../docs/TEST_STRATEGY.md)
6. [TEST_FILE_MAP.md](../docs/TEST_FILE_MAP.md)
7. [PRISMA_FILE_MAP.md](../docs/PRISMA_FILE_MAP.md)

## Intended Use

When you need to change behavior:
- start with the source map to find the responsible module
- then use the function index to find the owning entrypoint inside that module
- use the task guide to avoid reading unrelated files
- use the test strategy doc to understand which regressions require integration coverage
- use the test map to find the regression tests that should move with the change
- use the Prisma map when persistence or schema behavior is involved
- treat these docs as the source of truth for file ownership; update them when files, commands, or orchestration boundaries change

When you need to debug runtime behavior:
- check the source map for orchestration and observability modules
- then open the matching tests to see what behavior is already covered

## Scope

These docs focus on:
- root project files
- all `src/` files
- all `tests/` files
- Prisma schema and migrations

Generated files and runtime artifacts are not documented here in detail because they are transient.
