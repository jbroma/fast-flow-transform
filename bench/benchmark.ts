import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createBabelOptions, createCandidates } from './candidates.ts';
import type { BenchmarkCandidate, BenchmarkJob } from './candidates.ts';
import { summarizeRuns } from './stats.ts';
import type { RunSummary } from './stats.ts';

export interface BenchmarkInput extends BenchmarkJob {
  iterations: number;
  jsonPath?: string;
}

export interface CandidateReport {
  firstRunMs: number;
  name: string;
  runsMs: number[];
  summary: RunSummary;
}

export interface BenchmarkReport {
  candidates: CandidateReport[];
  fixturePath: string;
  generatedAt: string;
  iterations: number;
}

interface BenchmarkRuntimeOptions {
  candidates?: BenchmarkCandidate[];
  now?: () => bigint;
}

function benchDirectory(): string {
  return fileURLToPath(new URL('.', import.meta.url));
}

function defaultFixturePath(): string {
  return resolve(benchDirectory(), 'fixtures', 'single-file-flow.js');
}

function durationMs(startNs: bigint, endNs: bigint): number {
  return Number(endNs - startNs) / 1e6;
}

function parseIterations(rawValue: string | undefined): number {
  if (rawValue === undefined) {
    return 300;
  }

  const iterations = Number(rawValue);

  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new Error(
      `BENCH_ITERATIONS must be a positive integer, received: ${String(rawValue)}`
    );
  }

  return iterations;
}

async function runCandidate(
  candidate: BenchmarkCandidate,
  input: BenchmarkInput,
  now: () => bigint
): Promise<CandidateReport> {
  const coldStart = now();
  await candidate.run(input);
  const coldEnd = now();

  return {
    firstRunMs: durationMs(coldStart, coldEnd),
    name: candidate.name,
    runsMs: [],
    summary: summarizeRuns([]),
  };
}

function formatMetric(value: number): string {
  return value.toFixed(2);
}

function tableRow(name: string, coldMs: number, summary: RunSummary): string {
  const columns = [
    name.padEnd(14),
    formatMetric(coldMs).padStart(8),
    formatMetric(summary.meanMs).padStart(8),
    formatMetric(summary.medianMs).padStart(8),
    formatMetric(summary.p95Ms).padStart(8),
    formatMetric(summary.minMs).padStart(8),
    formatMetric(summary.maxMs).padStart(8),
  ];

  return columns.join(' ');
}

function meanSpeedup(baseMs: number, fftMs: number): string {
  if (fftMs === 0) {
    return 'n/a';
  }

  return `${(baseMs / fftMs).toFixed(2)}x`;
}

function reportPath(jsonPath: string): string {
  return resolve(jsonPath);
}

function rotateCandidates(
  candidates: BenchmarkCandidate[],
  offset: number
): BenchmarkCandidate[] {
  return candidates.map((_candidate, index) => {
    const candidate = candidates[(index + offset) % candidates.length];

    if (!candidate) {
      throw new Error('Expected benchmark candidate to exist');
    }

    return candidate;
  });
}

function speedupLines(report: BenchmarkReport): string[] {
  const fftResult = report.candidates.find(
    (candidate) => candidate.name === 'fft'
  );

  if (!fftResult) {
    return [];
  }

  return report.candidates
    .filter((candidate) => candidate.name !== 'fft')
    .map(
      (candidate) =>
        `fft mean speedup vs ${candidate.name}: ${meanSpeedup(
          candidate.summary.meanMs,
          fftResult.summary.meanMs
        )}`
    );
}

export function resolveBenchmarkInput(
  env: NodeJS.ProcessEnv = process.env
): BenchmarkInput {
  const filename = env.BENCH_FIXTURE
    ? resolve(env.BENCH_FIXTURE)
    : defaultFixturePath();
  const jsonPath = env.BENCH_JSON_PATH
    ? resolve(env.BENCH_JSON_PATH)
    : undefined;

  return {
    code: readFileSync(filename, 'utf8'),
    filename,
    iterations: parseIterations(env.BENCH_ITERATIONS),
    jsonPath,
  };
}

async function measureFirstRuns(
  candidates: BenchmarkCandidate[],
  input: BenchmarkInput,
  now: () => bigint
): Promise<CandidateReport[]> {
  const reports: CandidateReport[] = [];

  for (const candidate of candidates) {
    reports.push(await runCandidate(candidate, input, now));
  }

  return reports;
}

function reportLookup(
  reports: CandidateReport[]
): Map<string, CandidateReport> {
  return new Map(reports.map((report) => [report.name, report] as const));
}

async function measureWarmRuns(
  candidates: BenchmarkCandidate[],
  input: BenchmarkInput,
  reportsByName: Map<string, CandidateReport>,
  now: () => bigint
): Promise<void> {
  for (let index = 0; index < input.iterations; index += 1) {
    const candidateOrder = rotateCandidates(
      candidates,
      index % candidates.length
    );

    for (const candidate of candidateOrder) {
      const start = now();
      await candidate.run(input);
      reportsByName.get(candidate.name)?.runsMs.push(durationMs(start, now()));
    }
  }
}

function finalizeReports(reports: CandidateReport[]): CandidateReport[] {
  for (const report of reports) {
    report.summary = summarizeRuns(report.runsMs);
  }

  return reports;
}

export async function runBenchmarks(
  input: BenchmarkInput,
  options: BenchmarkRuntimeOptions = {}
): Promise<BenchmarkReport> {
  const candidates = options.candidates ?? createCandidates();
  const now = options.now ?? (() => process.hrtime.bigint());
  const reports = await measureFirstRuns(candidates, input, now);
  const reportsByName = reportLookup(reports);

  await measureWarmRuns(candidates, input, reportsByName, now);

  return {
    candidates: finalizeReports(reports),
    fixturePath: input.filename,
    generatedAt: new Date().toISOString(),
    iterations: input.iterations,
  };
}

export function formatSummaryTable(report: BenchmarkReport): string {
  const lines = [
    'Single-file Flow transform benchmark',
    `fixture: ${report.fixturePath}`,
    `iterations: ${String(report.iterations)}`,
    '',
    'candidate         first     mean   median      p95      min      max',
  ];

  for (const candidate of report.candidates) {
    lines.push(
      tableRow(candidate.name, candidate.firstRunMs, candidate.summary)
    );
  }

  const ratios = speedupLines(report);

  if (ratios.length > 0) {
    lines.push('', ...ratios);
  }

  return lines.join('\n');
}

export function writeBenchmarkReport(
  report: BenchmarkReport,
  jsonPath?: string
): string | null {
  if (!jsonPath) {
    return null;
  }

  const outputPath = reportPath(jsonPath);
  writeFileSync(outputPath, JSON.stringify(report, null, 2));
  return outputPath;
}

export { createBabelOptions };
