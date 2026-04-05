export type SiteFeedbackSeverity = "error" | "warning" | "info";

export interface SiteFeedbackMessage {
  severity: SiteFeedbackSeverity;
  message: string;
  source?: string | null;
}

export interface SiteFeedbackSnapshot {
  errors: string[];
  warnings: string[];
  infos: string[];
  messages: SiteFeedbackMessage[];
}

// Creates a stable empty snapshot so callers can always return the same shape.
export function createEmptySiteFeedbackSnapshot(): SiteFeedbackSnapshot {
  return {
    errors: [],
    warnings: [],
    infos: [],
    messages: [],
  };
}

// Merges multiple snapshots while deduplicating messages per severity bucket.
export function mergeSiteFeedbackSnapshots(
  ...snapshots: Array<SiteFeedbackSnapshot | null | undefined>
): SiteFeedbackSnapshot {
  const merged = createEmptySiteFeedbackSnapshot();
  const seenBySeverity = {
    error: new Set<string>(),
    warning: new Set<string>(),
    info: new Set<string>(),
  };

  for (const snapshot of snapshots) {
    if (!snapshot) {
      continue;
    }

    for (const message of snapshot.messages) {
      const normalized = message.message.trim();
      if (!normalized || seenBySeverity[message.severity].has(normalized)) {
        continue;
      }

      seenBySeverity[message.severity].add(normalized);
      merged.messages.push({
        severity: message.severity,
        message: normalized,
        ...(message.source ? { source: message.source } : {}),
      });
    }
  }

  merged.errors = merged.messages
    .filter((message) => message.severity === "error")
    .map((message) => message.message);
  merged.warnings = merged.messages
    .filter((message) => message.severity === "warning")
    .map((message) => message.message);
  merged.infos = merged.messages
    .filter((message) => message.severity === "info")
    .map((message) => message.message);

  return merged;
}

// Small convenience helper for callers that only care whether anything was captured.
export function hasSiteFeedback(snapshot: SiteFeedbackSnapshot | null | undefined): boolean {
  return Boolean(snapshot && snapshot.messages.length > 0);
}
