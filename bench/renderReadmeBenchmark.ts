import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  BenchmarkReport,
  BenchmarkSuiteReport,
  CandidateReport,
} from './benchmarkReport.ts';

interface ReadmeCaseRow {
  babelMeanMs: number;
  fftMeanMs: number;
  label: string;
  speedup: number;
}

const CANVAS_WIDTH = 1200;
const CONTENT_LEFT = 56;
const CASE_X = 76;
const COLUMN_BABEL_X = 900;
const COLUMN_FFT_X = 740;
const MONOSPACE_FONT =
  "'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'Liberation Mono', monospace";
const SPEEDUP_X = 1088;
const SUMMARY_GAP = 16;
const SUMMARY_HEIGHT = 116;
const ROW_HEIGHT = 52;
const TABLE_TOP = SUMMARY_HEIGHT + SUMMARY_GAP + 44;
const TABLE_WIDTH = 1088;

function repoRoot(): string {
  return fileURLToPath(new URL('..', import.meta.url));
}

function assetPath(envName: string, fallback: string): string {
  return resolve(repoRoot(), process.env[envName] ?? fallback);
}

function readReport(path: string): BenchmarkSuiteReport {
  return JSON.parse(readFileSync(path, 'utf8')) as BenchmarkSuiteReport;
}

function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function displayCaseName(caseName: string): string {
  const labels: Record<string, string> = {
    'compact without sourcemaps': 'compact',
    'pretty without sourcemaps': 'pretty',
    'compact with sourcemaps': 'compact + maps',
    'pretty with sourcemaps': 'pretty + maps',
    'preserve whitespace without comments': 'preserve ws',
    'preserve whitespace with comments': 'preserve ws + comments',
  };

  return labels[caseName] ?? caseName;
}

function candidateFor(
  report: BenchmarkReport,
  candidateName: string
): CandidateReport {
  for (const view of report.views) {
    for (const candidate of view.candidates) {
      if (candidate.name === candidateName) {
        return candidate;
      }
    }
  }

  throw new Error(`Missing benchmark candidate: ${candidateName}`);
}

function speedup(baseMs: number, fftMs: number): number {
  if (baseMs === 0 || fftMs === 0) {
    return 0;
  }

  return baseMs / fftMs;
}

function caseRows(report: BenchmarkSuiteReport): ReadmeCaseRow[] {
  return report.cases.map((benchmarkCase) => {
    const fft = candidateFor(benchmarkCase, 'fft');
    const babel = candidateFor(benchmarkCase, 'babel');

    return {
      babelMeanMs: babel.summary.meanMs,
      fftMeanMs: fft.summary.meanMs,
      label: displayCaseName(benchmarkCase.caseName),
      speedup: speedup(babel.summary.meanMs, fft.summary.meanMs),
    };
  });
}

function formatMs(value: number): string {
  return `${value.toFixed(2)} ms`;
}

function canvasHeight(rows: ReadmeCaseRow[]): number {
  return TABLE_TOP + rows.length * ROW_HEIGHT + 96;
}

function formatSpeedup(value: number): string {
  return `${value.toFixed(2)}x`;
}

function headerBlock(report: BenchmarkSuiteReport): string {
  const fixture = basename(report.fixturePath);

  return [
    `<text x="${CASE_X}" y="52" fill="#c9d1d9" font-size="34" font-weight="800">FFT vs Babel Flow stripping</text>`,
    `<text x="${CASE_X}" y="80" fill="#8b949e" font-size="16">Warm mean transform time across six benchmark cases.</text>`,
    `<text x="${CASE_X}" y="104" fill="#8b949e" font-size="16">Fixture: ${escapeXml(fixture)}  •  Lower times are better.</text>`,
  ].join('');
}

function tableHeader(): string {
  return [
    `<rect x="${CONTENT_LEFT}" y="${TABLE_TOP - 44}" width="${TABLE_WIDTH}" height="32" rx="10" fill="#161b22" stroke="#30363d" />`,
    `<text x="${CASE_X}" y="${TABLE_TOP - 23}" fill="#8b949e" font-size="12" font-weight="700">CASE</text>`,
    `<text x="${COLUMN_FFT_X}" y="${TABLE_TOP - 23}" fill="#79c0ff" font-size="12" font-weight="700" text-anchor="end">FFT</text>`,
    `<text x="${COLUMN_BABEL_X}" y="${TABLE_TOP - 23}" fill="#8b949e" font-size="12" font-weight="700" text-anchor="end">BABEL</text>`,
    `<text x="${SPEEDUP_X}" y="${TABLE_TOP - 23}" fill="#3fb950" font-size="12" font-weight="700" text-anchor="end">SPEEDUP</text>`,
  ].join('');
}

function caseRowBlock(row: ReadmeCaseRow, index: number): string {
  const y = TABLE_TOP + index * ROW_HEIGHT;
  const fill = index % 2 === 0 ? '#161b22' : '#0d1117';

  return [
    `<rect x="${CONTENT_LEFT}" y="${y}" width="${TABLE_WIDTH}" height="44" rx="14" fill="${fill}" stroke="#30363d" />`,
    `<text x="${CASE_X}" y="${y + 28}" fill="#c9d1d9" font-size="16" font-weight="600">${escapeXml(row.label)}</text>`,
    `<text x="${COLUMN_FFT_X}" y="${y + 28}" fill="#79c0ff" font-size="16" font-weight="700" text-anchor="end">${escapeXml(formatMs(row.fftMeanMs))}</text>`,
    `<text x="${COLUMN_BABEL_X}" y="${y + 28}" fill="#8b949e" font-size="16" font-weight="700" text-anchor="end">${escapeXml(formatMs(row.babelMeanMs))}</text>`,
    `<text x="${SPEEDUP_X}" y="${y + 31}" fill="#3fb950" font-size="22" font-weight="800" text-anchor="end">${escapeXml(formatSpeedup(row.speedup))}</text>`,
  ].join('');
}

function caseRowsBlock(rows: ReadmeCaseRow[]): string {
  return rows.map((row, index) => caseRowBlock(row, index)).join('');
}

function footerBlock(report: BenchmarkSuiteReport, height: number): string {
  const footer = [
    `Fixture ${basename(report.fixturePath)}`,
    `Iterations ${String(report.iterations)}`,
    `Platform ${process.platform}-${process.arch}`,
    `Node ${process.version}`,
    `Generated ${report.generatedAt}`,
  ].join('  •  ');

  return `<text x="56" y="${height - 28}" fill="#8b949e" font-size="12">${escapeXml(footer)}</text>`;
}

function svgTemplate(report: BenchmarkSuiteReport): string {
  const rows = caseRows(report);
  const height = canvasHeight(rows);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_WIDTH}" height="${height}" viewBox="0 0 ${CANVAS_WIDTH} ${height}" role="img" aria-labelledby="title desc">`,
    '<title id="title">fast-flow-transform benchmark summary</title>',
    '<desc id="desc">Warm mean FFT versus Babel Flow-stripping benchmark results across six benchmark cases.</desc>',
    `<rect width="${CANVAS_WIDTH}" height="${height}" rx="24" fill="#0d1117" />`,
    `<g font-family="${MONOSPACE_FONT}">`,
    headerBlock(report),
    tableHeader(),
    caseRowsBlock(rows),
    footerBlock(report, height),
    '</g>',
    '</svg>',
  ].join('\n');
}

function writeSvg(path: string, report: BenchmarkSuiteReport): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${svgTemplate(report)}\n`);
}

function main(): void {
  const jsonPath = assetPath('BENCH_JSON_PATH', 'assets/readme-benchmark.json');
  const svgPath = assetPath('BENCH_SVG_PATH', 'assets/readme-benchmark.svg');
  const report = readReport(jsonPath);

  writeSvg(svgPath, report);
}

main();
