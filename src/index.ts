import { withPage } from "./browser/playwright.js";
import { prisma } from "./db/client.js";
import { extractJobText } from "./parser/extractJobText.js";
import { parseJobWithLLM } from "./parser/parseJobWithLLM.js";
import { logger } from "./utils/logger.js";

async function main() {
  const url = process.argv[2];

  if (!url) {
    throw new Error("Usage: npm run dev -- <job-url>");
  }

  logger.info({ url }, "Starting job fetch");

  const rawText = await withPage(async (page) => {
    return extractJobText(page, url);
  });

  logger.info({ length: rawText.length }, "Job text extracted");

  const parsed = await parseJobWithLLM(rawText);

  logger.info({ parsed }, "Job parsed");

  const saved = await prisma.jobPosting.upsert({
    where: { url },
    update: {
      rawText,
      title: parsed.title,
      company: parsed.company,
      location: parsed.location,
      platform: parsed.platform,
      parsedJson: JSON.stringify(parsed),
    },
    create: {
      url,
      rawText,
      title: parsed.title,
      company: parsed.company,
      location: parsed.location,
      platform: parsed.platform,
      parsedJson: JSON.stringify(parsed),
    },
  });

  logger.info({ id: saved.id }, "Job saved to database");
}

main()
  .catch((error: unknown) => {
    logger.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
