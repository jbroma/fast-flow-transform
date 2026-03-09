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
  const paddedName = name.padEnd(20);

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

function tableRow(name: string, coldMs: number, summary: RunSummary): string {
  return [
    candidateLabel(name),
    formatMetric(coldMs).padStart(8),
    formatMetric(summary.meanMs).padStart(8),
    formatMetric(summary.medianMs).padStart(8),
    formatMetric(summary.p95Ms).padStart(8),
    formatMetric(summary.minMs).padStart(8),
    formatMetric(summary.maxMs).padStart(8),
  ].join(' ');
}

function speedup(baseMs: number, fftMs: number): string {
  if (fftMs === 0 || baseMs === 0) {
    return 'n/a';
  }

  return `${(baseMs / fftMs).toFixed(2)}x`;
}

function benchmarkSpeedupLine(
  fftLabel: string,
  baseLabel: string,
  baseMs: number,
  fftMs: number
): string {
  const speedupValue = speedup(baseMs, fftMs);
  const paintedSpeedup =
    speedupValue === 'n/a'
      ? paint('red', speedupValue)
      : paint(['bold', 'green'], speedupValue);

  return `${paint('bold', `${fftLabel} mean speedup vs ${baseLabel}:`)} ${paintedSpeedup}`;
}

function displayCandidateName(viewName: string, candidateName: string): string {
  if (viewName === 'isolated fft-only') {
    return 'fft (isolated)';
  }

  if (viewName === 'isolated babel-only') {
    return 'babel (isolated)';
  }

  return candidateName;
}

function combinedCandidates(
  report: BenchmarkReport
): { displayName: string; report: CandidateReport }[] {
  return report.views.flatMap((view) =>
    view.candidates.map((candidate) => ({
      displayName: displayCandidateName(view.viewName, candidate.name),
      report: candidate,
    }))
  );
}

function combinedSpeedupLines(report: BenchmarkReport): string[] {
  const lines: string[] = [];
  const alternatingFft = report.views[0]?.candidates[0];
  const alternatingBabel = report.views[0]?.candidates[1];
  const isolatedFft = report.views[1]?.candidates[0];
  const isolatedBabel = report.views[2]?.candidates[0];

  if (alternatingFft && alternatingBabel) {
    lines.push(
      benchmarkSpeedupLine(
        'fft',
        'babel',
        alternatingBabel.summary.meanMs,
        alternatingFft.summary.meanMs
      )
    );
  }

  if (isolatedFft && isolatedBabel) {
    lines.push(
      benchmarkSpeedupLine(
        'fft (isolated)',
        'babel (isolated)',
        isolatedBabel.summary.meanMs,
        isolatedFft.summary.meanMs
      )
    );
  }

  return lines;
}

function formatCandidateTable(report: BenchmarkReport): string {
  const lines = [
    paint(
      'dim',
      'candidate             first     mean   median      p95      min      max'
    ),
  ];

  for (const candidate of combinedCandidates(report)) {
    lines.push(
      tableRow(
        candidate.displayName,
        candidate.report.firstRunMs,
        candidate.report.summary
      )
    );
  }

  const speedups = combinedSpeedupLines(report);
  if (speedups.length > 0) {
    lines.push('', ...speedups);
  }

  return lines.join('\n');
}

export function formatSummaryTable(report: BenchmarkReport): string {
  const lines = [
    paint(['bold', 'cyan'], 'Single-file Flow transform benchmark'),
    paint('dim', `fixture: ${report.fixturePath}`),
    paint('dim', `iterations: ${String(report.iterations)}`),
    paint(['bold', 'magenta'], `case: ${report.caseName}`),
    '',
    formatCandidateTable(report),
  ];

  return lines.join('\n');
}

export function formatSuiteSummary(report: BenchmarkSuiteReport): string {
  return report.cases.map((entry) => formatSummaryTable(entry)).join('\n\n');
}
