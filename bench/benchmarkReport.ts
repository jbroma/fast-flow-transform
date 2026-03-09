import { basename } from 'node:path';
import { styleText } from 'node:util';

import type { RunSummary } from './stats.ts';

export interface CandidateReport {
  firstRunMs: number;
  name: string;
  runsMs: number[];
  summary: RunSummary;
}

export interface BenchmarkViewReport {
  candidates: CandidateReport[];
  viewName: string;
}

export interface BenchmarkReport {
  caseName: string;
  fixturePath: string;
  format: 'compact' | 'pretty';
  generatedAt: string;
  iterations: number;
  preserveComments: boolean;
  preserveWhitespace: boolean;
  sourcemap: boolean;
  views: BenchmarkViewReport[];
}

export interface BenchmarkSuiteReport {
  cases: BenchmarkReport[];
  fixturePath: string;
  generatedAt: string;
  iterations: number;
}

function formatMetric(value: number): string {
  return value.toFixed(2);
}

function paint(format: string | string[], text: string): string {
  return styleText(format, text, { validateStream: false });
}

function booleanLabel(value: boolean): string {
  return value ? 'yes' : 'no';
}

function candidateKind(name: string): string {
  if (name.startsWith('fft')) {
    return 'fft';
  }

  if (name.startsWith('babel')) {
    return 'babel';
  }

  return 'other';
}

function candidateLabel(name: string): string {
  const paddedName = name.padEnd(8);

  switch (candidateKind(name)) {
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

function metricCells(summary: RunSummary): string[] {
  return [
    formatMetric(summary.meanMs).padStart(7),
    formatMetric(summary.medianMs).padStart(7),
    formatMetric(summary.p95Ms).padStart(7),
    formatMetric(summary.minMs).padStart(7),
    formatMetric(summary.maxMs).padStart(7),
  ];
}

function detailLine(report: BenchmarkReport): string {
  return paint(
    'dim',
    [
      `fmt=${report.format}`,
      `sm=${booleanLabel(report.sourcemap)}`,
      `ws=${booleanLabel(report.preserveWhitespace)}`,
      `cm=${booleanLabel(report.preserveComments)}`,
    ].join(' ')
  );
}

function speedup(baseMs: number, fftMs: number): string {
  if (fftMs === 0 || baseMs === 0) {
    return 'n/a';
  }

  return `${(baseMs / fftMs).toFixed(2)}x`;
}

function reportCandidates(report: BenchmarkReport): CandidateReport[] {
  return report.views.flatMap((view) => view.candidates);
}

function findCandidate(
  report: BenchmarkReport,
  name: string
): CandidateReport | undefined {
  return reportCandidates(report).find((candidate) => candidate.name === name);
}

function tableHeader(): string {
  return paint(
    'dim',
    [
      'cand'.padEnd(8),
      'mean'.padStart(7),
      'med'.padStart(7),
      'p95'.padStart(7),
      'min'.padStart(7),
      'max'.padStart(7),
    ].join(' ')
  );
}

function tableRow(candidate: CandidateReport): string {
  return [
    candidateLabel(candidate.name),
    ...metricCells(candidate.summary),
  ].join(' ');
}

function speedupLine(report: BenchmarkReport): string | null {
  const fft = findCandidate(report, 'fft');
  const babel = findCandidate(report, 'babel');

  if (!fft || !babel) {
    return null;
  }

  const value = speedup(babel.summary.meanMs, fft.summary.meanMs);
  const rendered =
    value === 'n/a' ? paint('red', value) : paint(['bold', 'green'], value);

  return `${paint('bold', 'speedup')} ${rendered}`;
}

function formatCandidateTable(report: BenchmarkReport): string {
  const lines = [tableHeader()];

  for (const candidate of reportCandidates(report)) {
    lines.push(tableRow(candidate));
  }

  return lines.join('\n');
}

function caseBlock(report: BenchmarkReport): string {
  const lines = [
    paint(['bold', 'magenta'], `case: ${report.caseName}`),
    detailLine(report),
    formatCandidateTable(report),
  ];

  const speedupSummary = speedupLine(report);
  if (speedupSummary) {
    lines.push(speedupSummary);
  }

  return lines.join('\n');
}

function fixtureLine(path: string): string {
  return `fixture: ${basename(path)}`;
}

export function formatSummaryTable(report: BenchmarkReport): string {
  const lines = [
    paint(['bold', 'cyan'], 'Single-file Flow transform benchmark'),
    paint('dim', fixtureLine(report.fixturePath)),
    paint('dim', `iterations: ${String(report.iterations)}`),
    '',
    caseBlock(report),
  ];

  return lines.join('\n');
}

export function formatSuiteSummary(report: BenchmarkSuiteReport): string {
  const lines = [
    paint(['bold', 'cyan'], 'Single-file Flow transform benchmark'),
    paint('dim', fixtureLine(report.fixturePath)),
    paint('dim', `iterations: ${String(report.iterations)}`),
  ];

  for (const benchmarkCase of report.cases) {
    lines.push('', caseBlock(benchmarkCase));
  }

  return lines.join('\n');
}
