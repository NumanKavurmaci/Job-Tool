export const LINKEDIN_ALREADY_APPLIED_SELECTORS = [
  "#jobs-apply-see-application-link",
  ".jobs-s-apply__application-link",
  ".artdeco-inline-feedback__message:has-text('Applied')",
] as const;

export const LINKEDIN_JOB_SURFACE_SELECTORS = [
  ".jobs-search-results__list-item",
  "li.scaffold-layout__list-item",
  ".jobs-search__job-details--container",
  ".jobs-details",
  ".jobs-unified-top-card",
] as const;

export function joinSelectors(selectors: readonly string[]): string {
  return selectors.join(", ");
}

export function buildPostClickSurfaceSelector(args: {
  externalApplyTriggerSelector: string;
  externalHeaderApplyFallbackSelector: string;
}): string {
  return joinSelectors([
    ".jobs-easy-apply-modal",
    "[role='dialog']",
    ...LINKEDIN_ALREADY_APPLIED_SELECTORS,
    args.externalApplyTriggerSelector,
    args.externalHeaderApplyFallbackSelector,
  ]);
}

export function buildLinkedInJobSurfaceSelector(args: {
  easyApplyTriggerSelector: string;
  externalApplyTriggerSelector: string;
}): string {
  return joinSelectors([
    ...LINKEDIN_JOB_SURFACE_SELECTORS,
    args.easyApplyTriggerSelector,
    args.externalApplyTriggerSelector,
    ...LINKEDIN_ALREADY_APPLIED_SELECTORS,
  ]);
}
