import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { styleText } from 'node:util';

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
  caseName: string;
  fixturePath: string;
  generatedAt: string;
  iterations: number;
}

interface BenchmarkRuntimeOptions {
  caseName?: string;
  candidates?: BenchmarkCandidate[];
  now?: () => bigint;
}

export interface BenchmarkCase {
  caseName: string;
  sourcemap: boolean;
}

export interface BenchmarkSuiteReport {
  cases: BenchmarkReport[];
  fixturePath: string;
  generatedAt: string;
  iterations: number;
}

const DEFAULT_BENCHMARK_CASES = Object.freeze<BenchmarkCase[]>([
  {
    caseName: 'without sourcemaps',
    sourcemap: false,
  },
  {
    caseName: 'with sourcemaps',
    sourcemap: true,
  },
]);

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

function paint(format: string | string[], text: string): string {
  return styleText(format, text, { validateStream: false });
}

function candidateLabel(name: string): string {
  const paddedName = name.padEnd(14);

  switch (name) {
    case 'fft': {
      return paddedName.replace(name, paint(['bold', 'green'], name));
    }
    case 'babel': {
      return paddedName.replace(name, paint(['bold', 'yellow'], name));
    }
    default: {
      return paddedName.replace(name, paint('cyan', name));
    }
  }
}

function tableRow(name: string, coldMs: number, summary: RunSummary): string {
  const columns = [
    candidateLabel(name),
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
    .map((candidate) => {
      const speedup = meanSpeedup(
        candidate.summary.meanMs,
        fftResult.summary.meanMs
      );
      const speedupValue =
        speedup === 'n/a'
          ? paint('red', speedup)
          : paint(['bold', 'green'], speedup);

      return `${paint('bold', `fft mean speedup vs ${candidate.name}:`)} ${speedupValue}`;
    });
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
    caseName: options.caseName ?? 'without sourcemaps',
    fixturePath: input.filename,
    generatedAt: new Date().toISOString(),
    iterations: input.iterations,
  };
}

export async function runBenchmarkCases(
  input: BenchmarkInput,
  options: { cases?: BenchmarkCase[]; now?: () => bigint } = {}
): Promise<BenchmarkSuiteReport> {
  const cases = options.cases ?? DEFAULT_BENCHMARK_CASES;
  const reports: BenchmarkReport[] = [];

  for (const benchmarkCase of cases) {
    reports.push(
      await runBenchmarks(input, {
        candidates: createCandidates({ sourcemap: benchmarkCase.sourcemap }),
        caseName: benchmarkCase.caseName,
        now: options.now,
      })
    );
  }

  return {
    cases: reports,
    fixturePath: input.filename,
    generatedAt: new Date().toISOString(),
    iterations: input.iterations,
  };
}

export function formatSummaryTable(report: BenchmarkReport): string {
  const lines = [
    paint(['bold', 'cyan'], 'Single-file Flow transform benchmark'),
    paint('dim', `fixture: ${report.fixturePath}`),
    paint('dim', `iterations: ${String(report.iterations)}`),
    paint(['bold', 'magenta'], `case: ${report.caseName}`),
    '',
    paint(
      'dim',
      'candidate         first     mean   median      p95      min      max'
    ),
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

export function formatSuiteSummary(report: BenchmarkSuiteReport): string {
  return report.cases.map((entry) => formatSummaryTable(entry)).join('\n\n');
}

export function writeBenchmarkReport(
  report: BenchmarkReport | BenchmarkSuiteReport,
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
