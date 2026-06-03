import path from "node:path";
import { fileURLToPath } from "node:url";

export { appDeps } from "./app/deps.js";
export { parseCliArgs } from "./app/cli.js";
export { main, runCli } from "./app/main.js";
export {
  formatDashboardSummary,
  loadDashboardSnapshot,
} from "./dashboard/loadDashboardSnapshot.js";
export {
  extractReactJobsListings,
  isReactJobsListingUrl,
} from "./reactjobs/listing.js";
export {
  extractAshbyListings,
  isAshbyListingUrl,
} from "./ashby/listing.js";

import { runCli } from "./app/main.js";

const currentFilePath = fileURLToPath(import.meta.url);
const invokedFilePath = process.argv[1]
  ? path.resolve(process.argv[1])
  : null;

if (invokedFilePath === currentFilePath) {
  await runCli();
}
