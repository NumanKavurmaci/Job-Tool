import { parseJob } from "../llm/parseJob.js";
import type { ParsedJob } from "../llm/schema.js";
export { ParsedJobSchema, type ParsedJob } from "../llm/schema.js";

export async function parseJobWithLLM(jobText: string): Promise<ParsedJob> {
  const result = await parseJob(jobText);
  return result.parsed;
}
