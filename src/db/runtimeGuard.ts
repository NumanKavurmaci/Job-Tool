import fs from "node:fs";
import path from "node:path";
import { AppError } from "../utils/errors.js";

const LOCAL_DATABASE_PROTOCOLS = ["file:", "sqlite:"];
const LOCAL_ENGINE_PATTERNS = [
  /^query_engine-.*\.dll\.node$/i,
  /^query_engine-.*\.so\.node$/i,
  /^query_engine-.*\.dylib\.node$/i,
  /^libquery_engine-.*$/i,
];

export function isLocalDatabaseUrl(databaseUrl: string | undefined): boolean {
  if (!databaseUrl) {
    return false;
  }

  return LOCAL_DATABASE_PROTOCOLS.some((protocol) =>
    databaseUrl.startsWith(protocol),
  );
}

export function hasLocalPrismaQueryEngine(
  clientDir: string,
  readdirSync: typeof fs.readdirSync = fs.readdirSync,
): boolean {
  try {
    const entries = readdirSync(clientDir, { withFileTypes: true });

    return entries.some(
      (entry) =>
        entry.isFile() &&
        LOCAL_ENGINE_PATTERNS.some((pattern) => pattern.test(entry.name)),
    );
  } catch {
    return false;
  }
}

export function assertPrismaRuntimeReady(args?: {
  databaseUrl?: string;
  clientDir?: string;
  readdirSync?: typeof fs.readdirSync;
}): void {
  const databaseUrl = args?.databaseUrl ?? process.env.DATABASE_URL;

  if (!isLocalDatabaseUrl(databaseUrl)) {
    return;
  }

  const clientDir =
    args?.clientDir ?? path.resolve(process.cwd(), "node_modules/.prisma/client");
  const readdirSync = args?.readdirSync ?? fs.readdirSync;

  if (hasLocalPrismaQueryEngine(clientDir, readdirSync)) {
    return;
  }

  throw new AppError({
    message:
      "Prisma client is missing a local query engine for the configured SQLite database. Run `npx prisma generate` and avoid `--no-engine` for local runtime use.",
    phase: "database",
    code: "PRISMA_LOCAL_ENGINE_MISSING",
    details: {
      clientDir,
      databaseUrl,
    },
  });
}
