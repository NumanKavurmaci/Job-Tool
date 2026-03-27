import { withPage } from "./browser/playwright.js";
import { prisma } from "./db/client.js";
import { extractJobText } from "./parser/extractJobText.js";
import { formatJobForLLM } from "./parser/formatJobForLLM.js";
import { parseJobWithLLM } from "./parser/parseJobWithLLM.js";
import { logger } from "./utils/logger.js";

export const appDeps = {
  withPage,
  prisma,
  extractJobText,
  formatJobForLLM,
  parseJobWithLLM,
  logger,
  exit: (code: number) => process.exit(code),
};

export async function main(url = process.argv[2], deps = appDeps) {
  if (!url) {
    throw new Error("Usage: npm run dev -- <job-url>");
  }

  deps.logger.info({ url }, "Starting job fetch");

  const extracted = await deps.withPage(async (page) => {
    return deps.extractJobText(page, url);
  });

  deps.logger.info(
    {
      adapterPlatform: extracted.platform,
      rawTextLength: extracted.rawText.length,
      title: extracted.title,
      company: extracted.company,
      location: extracted.location,
    },
    "Job content extracted",
  );

  const llmInput = deps.formatJobForLLM(extracted);
  const parsed = await deps.parseJobWithLLM(llmInput);

  deps.logger.info({ parsed }, "Job parsed");

  const saved = await deps.prisma.jobPosting.upsert({
    where: { url },
    update: {
      rawText: extracted.rawText,
      title: parsed.title ?? extracted.title,
      company: parsed.company ?? extracted.company,
      location: parsed.location ?? extracted.location,
      platform: parsed.platform ?? extracted.platform,
      parsedJson: JSON.stringify(parsed),
    },
    create: {
      url,
      rawText: extracted.rawText,
      title: parsed.title ?? extracted.title,
      company: parsed.company ?? extracted.company,
      location: parsed.location ?? extracted.location,
      platform: parsed.platform ?? extracted.platform,
      parsedJson: JSON.stringify(parsed),
    },
  });

  deps.logger.info({ id: saved.id }, "Job saved to database");

  return saved;
}

export async function runCli(deps = appDeps): Promise<void> {
  try {
    await main(undefined, deps);
  } catch (error: unknown) {
    deps.logger.error(error);
    deps.exit(1);
  } finally {
    await deps.prisma.$disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runCli();
}
