export { appDeps } from "./app/deps.js";
export { parseCliArgs } from "./app/cli.js";
export { main, runCli } from "./app/main.js";
export {
  formatDashboardSummary,
  loadDashboardSnapshot,
} from "./dashboard/loadDashboardSnapshot.js";

import { runCli } from "./app/main.js";

if (import.meta.url === `file://${process.argv[1]}`) {
  await runCli();
}
