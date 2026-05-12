export type TimingSummary = {
  count: number;
  totalMs: number;
  avgMs: number;
  maxMs: number;
};

export type TimingRecorder = {
  record(name: string, durationMs: number): void;
  time<T>(name: string, fn: () => Promise<T>): Promise<T>;
  snapshot(): Record<string, TimingSummary>;
};

export function createTimingRecorder(): TimingRecorder {
  const buckets = new Map<string, { count: number; totalMs: number; maxMs: number }>();

  const record = (name: string, durationMs: number) => {
    const safeDuration = Math.max(0, Math.round(durationMs));
    const current = buckets.get(name) ?? { count: 0, totalMs: 0, maxMs: 0 };
    current.count += 1;
    current.totalMs += safeDuration;
    current.maxMs = Math.max(current.maxMs, safeDuration);
    buckets.set(name, current);
  };

  return {
    record,
    async time<T>(name: string, fn: () => Promise<T>): Promise<T> {
      const startedAt = performance.now();
      try {
        return await fn();
      } finally {
        record(name, performance.now() - startedAt);
      }
    },
    snapshot() {
      return Object.fromEntries(
        [...buckets.entries()].map(([name, bucket]) => [
          name,
          {
            count: bucket.count,
            totalMs: bucket.totalMs,
            avgMs: bucket.count > 0 ? Math.round(bucket.totalMs / bucket.count) : 0,
            maxMs: bucket.maxMs,
          },
        ]),
      );
    },
  };
}
