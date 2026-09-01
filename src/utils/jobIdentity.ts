const LINKEDIN_HOST_PATTERN = /(^|\.)linkedin\.com$/i;

export function getLinkedInJobPostingId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!LINKEDIN_HOST_PATTERN.test(parsed.hostname)) {
      return null;
    }

    const pathId = parsed.pathname.match(
      /\/jobs\/view\/(?:[^/]*-)?(\d+)(?:\/|$)/i,
    )?.[1];
    if (pathId) {
      return pathId;
    }

    const currentJobId = parsed.searchParams.get("currentJobId")?.trim();
    return currentJobId && /^\d+$/.test(currentJobId) ? currentJobId : null;
  } catch {
    return null;
  }
}

export function canonicalizeJobPostingUrl(url: string): string {
  const linkedinJobId = getLinkedInJobPostingId(url);
  return linkedinJobId
    ? `https://www.linkedin.com/jobs/view/${linkedinJobId}`
    : url;
}

export function getJobPostingUrlAliases(url: string): string[] {
  const linkedinJobId = getLinkedInJobPostingId(url);
  if (!linkedinJobId) {
    return [url];
  }

  return [...new Set([
    url,
    `https://www.linkedin.com/jobs/view/${linkedinJobId}`,
    `https://www.linkedin.com/jobs/view/${linkedinJobId}/`,
    `https://linkedin.com/jobs/view/${linkedinJobId}`,
    `https://linkedin.com/jobs/view/${linkedinJobId}/`,
  ])];
}
