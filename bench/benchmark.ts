import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { formatSuiteSummary, formatSummaryTable } from './benchmarkReport.ts';
import type {
  BenchmarkReport,
  BenchmarkSuiteReport,
  BenchmarkViewReport,
  CandidateReport,
} from './benchmarkReport.ts';
import {
  createBabelCandidate,
  createBabelOptions,
  createCandidates,
  createFftCandidate,
} from './candidates.ts';
import type { BenchmarkCandidate, BenchmarkJob } from './candidates.ts';
import { summarizeRuns } from './stats.ts';

export interface BenchmarkInput extends BenchmarkJob {
  iterations: number;
  jsonPath?: string;
}

interface BenchmarkRuntimeOptions {
  caseName?: string;
  now?: () => bigint;
  sourcemap?: boolean;
}

export interface BenchmarkCase {
  caseName: string;
  sourcemap: boolean;
}

export interface BenchmarkViewDefinition {
  candidates: BenchmarkCandidate[];
  viewName: string;
}

const DEFAULT_BENCHMARK_CASES = Object.freeze<BenchmarkCase[]>([
  { caseName: 'without sourcemaps', sourcemap: false },
  { caseName: 'with sourcemaps', sourcemap: true },
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

function reportPath(jsonPath: string): string {
  return resolve(jsonPath);
}

function reportLookup(
  reports: CandidateReport[]
): Map<string, CandidateReport> {
  return new Map(reports.map((report) => [report.name, report] as const));
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

export function createBenchmarkViews(
  sourcemap: boolean
): BenchmarkViewDefinition[] {
  return [
    {
      candidates: createCandidates({ sourcemap }),
      viewName: 'alternating fft vs babel',
    },
    {
      candidates: [createFftCandidate({ sourcemap })],
      viewName: 'isolated fft-only',
    },
    {
      candidates: [
        createBabelCandidate((filename) =>
          createBabelOptions(filename, sourcemap)
        ),
      ],
      viewName: 'isolated babel-only',
    },
  ];
}

async function runCandidate(
  candidate: BenchmarkCandidate,
  input: BenchmarkInput,
  now: () => bigint
): Promise<CandidateReport> {
  const coldStart = now();
  await candidate.run(input);

  return {
    firstRunMs: durationMs(coldStart, now()),
    name: candidate.name,
    runsMs: [],
    summary: summarizeRuns([]),
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

async function measureWarmRuns(
  candidates: BenchmarkCandidate[],
  input: BenchmarkInput,
  reportsByName: Map<string, CandidateReport>,
  now: () => bigint
): Promise<void> {
  for (let index = 0; index < input.iterations; index += 1) {
    for (const candidate of rotateCandidates(
      candidates,
      index % candidates.length
    )) {
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

export async function runBenchmarkView(
  input: BenchmarkInput,
  view: BenchmarkViewDefinition,
  now: () => bigint
): Promise<BenchmarkViewReport> {
  const reports = await measureFirstRuns(view.candidates, input, now);
  await measureWarmRuns(view.candidates, input, reportLookup(reports), now);
  return { candidates: finalizeReports(reports), viewName: view.viewName };
}

export async function runBenchmarks(
  input: BenchmarkInput,
  options: BenchmarkRuntimeOptions = {}
): Promise<BenchmarkReport> {
  const sourcemap = options.sourcemap ?? false;
  const now = options.now ?? (() => process.hrtime.bigint());
  const views: BenchmarkViewReport[] = [];

  for (const view of createBenchmarkViews(sourcemap)) {
    views.push(await runBenchmarkView(input, view, now));
  }

  return {
    caseName: options.caseName ?? 'without sourcemaps',
    fixturePath: input.filename,
    generatedAt: new Date().toISOString(),
    iterations: input.iterations,
    views,
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
        caseName: benchmarkCase.caseName,
        now: options.now,
        sourcemap: benchmarkCase.sourcemap,
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

export { createBabelOptions, formatSummaryTable, formatSuiteSummary };
export type { BenchmarkCandidate };
