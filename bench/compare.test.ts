/// <reference types="vitest/globals" />

import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BenchmarkCandidate } from './benchmark.ts';
import {
  createBabelOptions,
  formatSummaryTable,
  formatSuiteSummary,
  runBenchmarks,
  runBenchmarkCases,
  runBenchmarkView,
  writeBenchmarkReport,
} from './benchmark.ts';
import {
  assertCaseSnippets,
  assertDefaultCaseCoverage,
} from './compareTestHelpers.ts';
import { summarizeRuns } from './stats.ts';

const benchRoot = dirname(fileURLToPath(import.meta.url));

function assertMinimalBabelOptions(
  options: ReturnType<typeof createBabelOptions>,
  expectedPlugins: unknown[]
): void {
  expect(options.babelrc).toBeFalsy();
  expect(options.configFile).toBeFalsy();
  expect(options.sourceMaps).toBeFalsy();
  expect(options.sourceType).toBe('module');
  expect(options.plugins).toStrictEqual(expectedPlugins);
}

function smokeInput() {
  return {
    code: `// @flow
export type Box<T> = {| value: T |};
export function render(input: number): string {
  const box: Box<number> = { value: input };
  return String(box.value);
}
`,
    filename: '/virtual/smoke.js',
    iterations: 1,
  };
}

function assertCandidateNames(
  report: Awaited<ReturnType<typeof runBenchmarks>>
): void {
  expect(report.views.map((view) => view.viewName)).toStrictEqual([
    'fft',
    'babel',
  ]);
  expect(
    report.views[0]?.candidates.map((candidate) => candidate.name)
  ).toStrictEqual(['fft']);
  expect(
    report.views[1]?.candidates.map((candidate) => candidate.name)
  ).toStrictEqual(['babel']);
}

function assertTableLabels(table: string): void {
  expect(
    [
      'fft',
      'babel',
      'case:',
      'fmt=',
      'sm=',
      'ws=',
      'cm=',
      'cand',
      'mean',
      'med',
      'p95',
      'min',
      'max',
    ].every((snippet) => table.includes(snippet))
  ).toBeTruthy();
}

function createFakeCandidate(): BenchmarkCandidate {
  return {
    name: 'fake',
    run() {
      return Promise.resolve();
    },
  };
}

function createDeterministicClock(timestamps: bigint[]): () => bigint {
  let index = 0;

  return () => {
    const timestamp = timestamps[index] ?? 0n;
    index += 1;
    return timestamp;
  };
}

function createWarmClock(samples: number): () => bigint {
  const timestamps: bigint[] = [];

  for (let index = 0; index < samples; index += 1) {
    const start = BigInt(index * 2) * 1_000_000n;
    timestamps.push(start, start + 1_000_000n);
  }

  return createDeterministicClock(timestamps);
}

function requireValue<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new Error(message);
  }

  return value;
}

describe('benchmark stats', () => {
  it('summarizeRuns returns stable aggregate metrics', () => {
    const summary = summarizeRuns([9, 1, 5, 7, 3]);

    expect(summary).toStrictEqual({
      maxMs: 9,
      meanMs: 5,
      medianMs: 5,
      minMs: 1,
      p95Ms: 9,
    });
  });
});

describe('benchmark candidate config', () => {
  it('babel config stays minimal, fixed-source-type, and Hermes-backed', () => {
    const filename = '/tmp/fixture.js';
    const babelOptions = createBabelOptions(filename);

    expect(babelOptions.filename).toBe(filename);
    assertMinimalBabelOptions(babelOptions, [
      'babel-plugin-syntax-hermes-parser',
      [
        '@babel/plugin-transform-flow-strip-types',
        { allowDeclareFields: true },
      ],
    ]);
  });

  it('can enable sourcemaps for the babel benchmark case', () => {
    const babelOptions = createBabelOptions('/tmp/fixture.js', true);

    expect(babelOptions.sourceMaps).toBeTruthy();
  });
});

describe('benchmark smoke execution', () => {
  it('runBenchmarks executes all candidates and default report is stdout-only', async () => {
    const reportPath = '/tmp/fft-bench-report.json';
    rmSync(reportPath, { force: true });
    const report = await runBenchmarks(smokeInput());

    assertCandidateNames(report);
    const fftCandidate = requireValue(
      report.views[0]?.candidates[0],
      'expected fft candidate'
    );

    expect(fftCandidate.name).toBe('fft');
    assertTableLabels(formatSummaryTable(report));
    expect(writeBenchmarkReport(report)).toBeNull();
    expect(existsSync(reportPath)).toBeFalsy();
  });
});

describe('benchmark case coverage', () => {
  it('runs compact and pretty benchmark cases with and without sourcemaps', async () => {
    expect.hasAssertions();
    const report = await runBenchmarkCases(smokeInput());

    assertDefaultCaseCoverage(report, formatSuiteSummary(report));
  });
});

describe('benchmark compare entrypoint', () => {
  it('compare entrypoint runs successfully', () => {
    const result = spawnSync('node', ['compare.ts'], {
      cwd: benchRoot,
      env: {
        ...process.env,
        BENCH_ITERATIONS: '1',
      },
      encoding: 'utf8',
    });

    expect({
      status: result.status,
      stderr: result.stderr,
    }).toStrictEqual({ status: 0, stderr: '' });
    assertCaseSnippets(result.stdout);
    expect(
      [
        'fft stage timings',
        'alternating fft vs babel',
        'isolated fft-only',
        'isolated babel-only',
      ].every((snippet) => !result.stdout.includes(snippet))
    ).toBeTruthy();
  });
});

describe('benchmark first-run metric', () => {
  it('records cold time separately from warm iteration timings', async () => {
    const report = await runBenchmarkView(
      {
        code: '',
        filename: '/virtual/fake.js',
        iterations: 2,
      },
      {
        candidates: [createFakeCandidate()],
        viewName: 'isolated fake-only',
      },
      createDeterministicClock([
        0n,
        5_000_000n,
        5_000_000n,
        7_000_000n,
        7_000_000n,
        10_000_000n,
      ])
    );

    expect(report.candidates[0]?.firstRunMs).toBe(5);
    expect(report.candidates[0]?.runsMs).toStrictEqual([2, 3]);
  });
});

describe('benchmark warm-order rotation', () => {
  it('rotates warm candidate order across iterations', async () => {
    const callOrder: string[] = [];
    const candidateA: BenchmarkCandidate = {
      name: 'alpha',
      run() {
        callOrder.push('alpha');
        return Promise.resolve();
      },
    };
    const candidateB: BenchmarkCandidate = {
      name: 'beta',
      run() {
        callOrder.push('beta');
        return Promise.resolve();
      },
    };

    await runBenchmarkView(
      {
        code: '',
        filename: '/virtual/order.js',
        iterations: 3,
      },
      {
        candidates: [candidateA, candidateB],
        viewName: 'alternating fake pair',
      },
      createWarmClock(8)
    );

    expect(callOrder).toStrictEqual([
      'alpha',
      'beta',
      'alpha',
      'beta',
      'beta',
      'alpha',
      'alpha',
      'beta',
    ]);
  });
});
