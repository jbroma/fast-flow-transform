import { expect } from 'vitest';

import type { runBenchmarkCases } from './benchmark.ts';

const EXPECTED_CASE_DETAILS = [
  {
    format: 'compact',
    preserveComments: false,
    preserveWhitespace: false,
    sourcemap: false,
  },
  {
    format: 'pretty',
    preserveComments: false,
    preserveWhitespace: false,
    sourcemap: false,
  },
  {
    format: 'compact',
    preserveComments: false,
    preserveWhitespace: false,
    sourcemap: true,
  },
  {
    format: 'pretty',
    preserveComments: false,
    preserveWhitespace: false,
    sourcemap: true,
  },
  // {
  //   format: 'pretty',
  //   preserveComments: false,
  //   preserveWhitespace: true,
  //   sourcemap: false,
  // },
  // {
  //   format: 'pretty',
  //   preserveComments: true,
  //   preserveWhitespace: true,
  //   sourcemap: false,
  // },
] as const;

const EXPECTED_CASE_NAMES = [
  'compact without sourcemaps',
  'pretty without sourcemaps',
  'compact with sourcemaps',
  'pretty with sourcemaps',
  // 'preserve whitespace without comments',
  // 'preserve whitespace with comments',
] as const;

type BenchmarkCaseSuite = Awaited<ReturnType<typeof runBenchmarkCases>>;

function benchmarkCaseDetails(report: BenchmarkCaseSuite) {
  return report.cases.map((entry) => ({
    format: entry.format,
    preserveComments: entry.preserveComments,
    preserveWhitespace: entry.preserveWhitespace,
    sourcemap: entry.sourcemap,
  }));
}

function flagLabel(value: boolean): string {
  return value ? 'yes' : 'no';
}

function stripAnsi(output: string): string {
  return output.replaceAll(
    new RegExp(`${String.fromCodePoint(27)}\\[[0-9;]*m`, 'g'),
    ''
  );
}

function assertSummaryHeaders(output: string): void {
  expect(
    [
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
    ].every((label) => output.includes(label))
  ).toBeTruthy();
}

function assertCaseDetails(output: string): void {
  for (const detail of EXPECTED_CASE_DETAILS) {
    const detailPattern = new RegExp(
      [
        `fmt=${detail.format}`,
        `sm=${flagLabel(detail.sourcemap)}`,
        `ws=${flagLabel(detail.preserveWhitespace)}`,
        `cm=${flagLabel(detail.preserveComments)}`,
      ].join(' ')
    );

    expect(output).toMatch(detailPattern);
  }
}

function assertCandidateSnippets(output: string): void {
  expect(output).toMatch(/\bfft\b/);
  expect(output).toMatch(/\bbabel\b/);
}

function assertLineWidths(output: string): void {
  expect(
    output
      .split('\n')
      .filter((line) => line.length > 0)
      .every((line) => line.length <= 80)
  ).toBeTruthy();
}

export function assertCaseSnippets(output: string): void {
  const normalizedOutput = stripAnsi(output);

  assertSummaryHeaders(normalizedOutput);
  assertCaseDetails(normalizedOutput);
  assertCandidateSnippets(normalizedOutput);
  assertLineWidths(normalizedOutput);
}

export function assertDefaultCaseCoverage(
  report: BenchmarkCaseSuite,
  table: string
): void {
  expect(benchmarkCaseDetails(report)).toStrictEqual(EXPECTED_CASE_DETAILS);
  expect(report.cases.map((entry) => entry.caseName)).toStrictEqual(
    EXPECTED_CASE_NAMES
  );
  assertCaseSnippets(table);
}
