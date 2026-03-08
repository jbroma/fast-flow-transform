export interface RunSummary {
  maxMs: number;
  meanMs: number;
  medianMs: number;
  minMs: number;
  p95Ms: number;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(sortedValues: number[], fraction: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }

  const index = Math.ceil(sortedValues.length * fraction) - 1;
  const boundedIndex = Math.min(sortedValues.length - 1, Math.max(0, index));
  return sortedValues[boundedIndex] ?? 0;
}

export function summarizeRuns(runs: number[]): RunSummary {
  if (runs.length === 0) {
    return {
      maxMs: 0,
      meanMs: 0,
      medianMs: 0,
      minMs: 0,
      p95Ms: 0,
    };
  }

  const sortedRuns = runs.toSorted((left, right) => left - right);
  const middleIndex = Math.floor(sortedRuns.length / 2);

  return {
    maxMs: sortedRuns.at(-1) ?? 0,
    meanMs: average(sortedRuns),
    medianMs:
      sortedRuns.length % 2 === 0
        ? ((sortedRuns[middleIndex - 1] ?? 0) +
            (sortedRuns[middleIndex] ?? 0)) /
          2
        : (sortedRuns[middleIndex] ?? 0),
    minMs: sortedRuns[0] ?? 0,
    p95Ms: percentile(sortedRuns, 0.95),
  };
}
