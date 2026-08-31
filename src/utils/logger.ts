import { mkdirSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import pino from "pino";

const logsDir = join(process.cwd(), "logs");
mkdirSync(logsDir, { recursive: true });
const isVitest = process.env.VITEST === "true" || process.env.NODE_ENV === "test";
const dashboardRunId = process.env.JOB_TOOL_RUN_ID?.trim();

const fileDestination = pino.destination({
  dest: join(logsDir, "app.log"),
  sync: false,
});

export const logger = pino(
  {
    level: "info",
    ...(dashboardRunId
      ? {
          base: {
            pid: process.pid,
            hostname: hostname(),
            dashboardRunId,
          },
        }
      : {}),
  },
  pino.multistream([
    ...(isVitest ? [] : [{ stream: process.stdout }]),
    { stream: fileDestination },
  ]),
);
