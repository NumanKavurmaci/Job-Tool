# Root File Map

This file explains the important project-root files.

## Root Files

- [README.md](../README.md): Public-facing project overview, setup, common commands, and high-level behavior.
- [PROJECT_DETAILS.md](../PROJECT_DETAILS.md): Longer architecture and workflow explanation for humans.
- [example-scripts.md](../example-scripts.md): Example commands for common local workflows.
- [package.json](../package.json): NPM metadata, scripts, dependencies, and dev dependencies.
- [package-lock.json](../package-lock.json): Locked dependency tree for reproducible installs.
- [tsconfig.json](../tsconfig.json): TypeScript compiler configuration.
- [vitest.config.ts](../vitest.config.ts): Default test runner configuration with coverage.
- [vitest.live.config.ts](../vitest.live.config.ts): Live/integration test configuration for provider-backed tests.
- [playwright.config.ts](../playwright.config.ts): Playwright configuration for browser-backed behavior.
- [.env.example](../.env.example): Example environment variables.
- [.env](../.env): Local environment configuration. Contains secrets and machine-specific settings.
- [.gitignore](../.gitignore): Git exclusions for generated files, logs, artifacts, and local state.
- [.gitattributes](../.gitattributes): Git file handling attributes.
- [LICENSE](../LICENSE): Project license.
- [user/README.md](../user/README.md): Explains the local user-data area and which files are tracked vs. ignored.
- [user/profile.example.json](../user/profile.example.json): Generic starter candidate profile for new users and AI navigation.
- `user/profile.json`: Local personal candidate profile. Intentionally ignored by Git and loaded first when present.
- `user/<resume-file>`: Optional local resume file. The CLI prefers resume files under `user/` when `--resume` is omitted.

## Main Code Entry

- [src/index.ts](../src/index.ts): Thin public entrypoint. Re-exports the app surface and calls `runCli()` when executed directly.

## Main Navigation Docs

- [docs/README.md](../docs/README.md): Central entrypoint for these AI-focused docs.
- [docs/SOURCE_FILE_MAP.md](../docs/SOURCE_FILE_MAP.md): Full `src/` map.
- [docs/TEST_FILE_MAP.md](../docs/TEST_FILE_MAP.md): Full `tests/` map.
- [docs/PRISMA_FILE_MAP.md](../docs/PRISMA_FILE_MAP.md): DB schema and migrations map.
