/// <reference types="vitest/globals" />

import { existsSync, rmSync } from 'node:fs';

import type { BenchmarkCandidate } from './benchmark.ts';
import {
  createBabelOptions,
  formatSummaryTable,
  runBenchmarks,
  writeBenchmarkReport,
} from './benchmark.ts';
import { configureBenchmarkBinary, workspaceBinaryPath } from './native.ts';
import { summarizeRuns } from './stats.ts';

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
  expect(report.candidates).toHaveLength(2);
  expect(report.candidates.map((candidate) => candidate.name)).toStrictEqual([
    'fft',
    'babel',
  ]);
}

function assertTableLabels(table: string): void {
  expect(table).toMatch(/fft/);
  expect(table).toMatch(/babel/);
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
});

describe('benchmark native binary selection', () => {
  it('prefers an explicit FFT_STRIP_BINARY override', () => {
    const env: NodeJS.ProcessEnv = {
      FFT_STRIP_BINARY: '/tmp/custom-fft-strip',
    };

    expect(configureBenchmarkBinary(env, () => true)).toBeNull();
    expect(env.FFT_STRIP_BINARY).toBe('/tmp/custom-fft-strip');
  });

  it('points benchmarks at the local release binary when available', () => {
    const env: NodeJS.ProcessEnv = {};
    const expectedPath = workspaceBinaryPath();

    expect(configureBenchmarkBinary(env, (path) => path === expectedPath)).toBe(
      expectedPath
    );
    expect(env.FFT_STRIP_BINARY).toBe(expectedPath);
  });
});

describe('benchmark smoke execution', () => {
  it('runBenchmarks executes all candidates and default report is stdout-only', async () => {
    const reportPath = '/tmp/fft-bench-report.json';
    rmSync(reportPath, { force: true });
    const report = await runBenchmarks(smokeInput());
    const table = formatSummaryTable(report);

    assertCandidateNames(report);
    assertTableLabels(table);
    expect(writeBenchmarkReport(report)).toBeNull();
    expect(existsSync(reportPath)).toBeFalsy();
  });
});

describe('benchmark first-run metric', () => {
  it('records cold time separately from warm iteration timings', async () => {
    const report = await runBenchmarks(
      {
        code: '',
        filename: '/virtual/fake.js',
        iterations: 2,
      },
      {
        candidates: [createFakeCandidate()],
        now: createDeterministicClock([
          0n,
          5_000_000n,
          5_000_000n,
          7_000_000n,
          7_000_000n,
          10_000_000n,
        ]),
      }
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

    await runBenchmarks(
      {
        code: '',
        filename: '/virtual/order.js',
        iterations: 3,
      },
      {
        candidates: [candidateA, candidateB],
        now: createWarmClock(8),
      }
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
