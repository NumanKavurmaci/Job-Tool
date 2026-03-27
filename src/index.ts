import { withPage } from "./browser/playwright.js";
import { prisma } from "./db/client.js";
import { extractJobText } from "./parser/extractJobText.js";
import { formatJobForLLM } from "./parser/formatJobForLLM.js";
import { parseJobWithLLM } from "./parser/parseJobWithLLM.js";
import { logger } from "./utils/logger.js";

async function main() {
  const url = process.argv[2];

  if (!url) {
    throw new Error("Usage: npm run dev -- <job-url>");
  }

  logger.info({ url }, "Starting job fetch");

  const extracted = await withPage(async (page) => {
    return extractJobText(page, url);
  });

  logger.info(
    {
      adapterPlatform: extracted.platform,
      rawTextLength: extracted.rawText.length,
      title: extracted.title,
      company: extracted.company,
      location: extracted.location,
    },
    "Job content extracted",
  );

  const llmInput = formatJobForLLM(extracted);
  const parsed = await parseJobWithLLM(llmInput);

  logger.info({ parsed }, "Job parsed");

  const saved = await prisma.jobPosting.upsert({
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
