import { mkdirSync } from "node:fs";
import { join } from "node:path";
import pino from "pino";

const logsDir = join(process.cwd(), "logs");
mkdirSync(logsDir, { recursive: true });

const fileDestination = pino.destination({
  dest: join(logsDir, "app.log"),
  sync: false,
});

export const logger = pino(
  {
    level: "info",
  },
  pino.multistream([
    { stream: process.stdout },
    { stream: fileDestination },
  ]),
);
