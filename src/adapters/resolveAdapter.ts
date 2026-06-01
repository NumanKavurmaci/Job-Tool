import { GenericAdapter } from "./GenericAdapter.js";
import { GreenhouseAdapter } from "./GreenhouseAdapter.js";
import { LeverAdapter } from "./LeverAdapter.js";
import { LinkedInAdapter } from "./LinkedInAdapter.js";
import { ReactJobsAdapter } from "./ReactJobsAdapter.js";
import type { JobAdapter } from "./types.js";

const adapters: JobAdapter[] = [
  new GreenhouseAdapter(),
  new LeverAdapter(),
  new LinkedInAdapter(),
  new ReactJobsAdapter(),
  new GenericAdapter(),
];

export function resolveAdapter(url: string): JobAdapter {
  return adapters.find((adapter) => adapter.canHandle(url)) ?? new GenericAdapter();
}
