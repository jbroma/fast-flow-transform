import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { createBenchmarkViews } from './benchmark.ts';
import type { BenchmarkInput } from './benchmark.ts';
import { DEFAULT_BENCHMARK_CASES } from './benchmarkCases.ts';
import type { BenchmarkCase } from './benchmarkCases.ts';
import type {
  BenchmarkReport,
  BenchmarkSuiteReport,
  BenchmarkViewReport,
} from './benchmarkReport.ts';

const execFileAsync = promisify(execFile);

interface IsolatedBenchmarkRequest {
  fixturePath: string;
  format: 'compact' | 'pretty';
  iterations: number;
  preserveComments: boolean;
  preserveWhitespace: boolean;
  sourcemap: boolean;
  viewName: string;
}

interface IsolatedRuntimeOptions {
  runView?: (
    request: IsolatedBenchmarkRequest
  ) => Promise<BenchmarkViewReport> | BenchmarkViewReport;
}

function viewProcessPath(): string {
  return fileURLToPath(new URL('benchmarkViewProcess.ts', import.meta.url));
}

function preserveFixturePath(filename: string): string {
  const extension = extname(filename);
  const stem = basename(filename, extension);
  return resolve(dirname(filename), `${stem}.preserve${extension}`);
}

function inputForCase(
  input: BenchmarkInput,
  preserveWhitespace: boolean
): BenchmarkInput {
  if (!preserveWhitespace) {
    return input;
  }

  const filename = preserveFixturePath(input.filename);
  if (!existsSync(filename)) {
    return input;
  }

  return {
    ...input,
    code: readFileSync(filename, 'utf8'),
    filename,
  };
}

async function runViewInFreshProcess(
  request: IsolatedBenchmarkRequest
): Promise<BenchmarkViewReport> {
  const { stdout } = await execFileAsync(process.execPath, [
    viewProcessPath(),
    JSON.stringify(request),
  ]);

  return JSON.parse(stdout) as BenchmarkViewReport;
}

async function runBenchmarkCaseIsolated(
  input: BenchmarkInput,
  benchmarkCase: BenchmarkCase,
  runtime: IsolatedRuntimeOptions
): Promise<BenchmarkReport> {
  const runView = runtime.runView ?? runViewInFreshProcess;
  const caseInput = inputForCase(input, benchmarkCase.preserveWhitespace);
  const views: BenchmarkViewReport[] = [];

  for (const view of createBenchmarkViews(
    benchmarkCase.sourcemap,
    benchmarkCase.format,
    benchmarkCase.preserveWhitespace,
    benchmarkCase.preserveComments
  )) {
    views.push(
      await runView({
        fixturePath: caseInput.filename,
        format: benchmarkCase.format,
        iterations: caseInput.iterations,
        preserveComments: benchmarkCase.preserveComments,
        preserveWhitespace: benchmarkCase.preserveWhitespace,
        sourcemap: benchmarkCase.sourcemap,
        viewName: view.viewName,
      })
    );
  }

  return {
    caseName: benchmarkCase.caseName,
    fixturePath: caseInput.filename,
    format: benchmarkCase.format,
    generatedAt: new Date().toISOString(),
    iterations: caseInput.iterations,
    preserveComments: benchmarkCase.preserveComments,
    preserveWhitespace: benchmarkCase.preserveWhitespace,
    sourcemap: benchmarkCase.sourcemap,
    views,
  };
}

export async function runBenchmarkCasesIsolated(
  input: BenchmarkInput,
  options: { cases?: BenchmarkCase[] } = {},
  runtime: IsolatedRuntimeOptions = {}
): Promise<BenchmarkSuiteReport> {
  const cases = options.cases ?? DEFAULT_BENCHMARK_CASES;
  const reports: BenchmarkReport[] = [];

  for (const benchmarkCase of cases) {
    reports.push(await runBenchmarkCaseIsolated(input, benchmarkCase, runtime));
  }

  return {
    cases: reports,
    fixturePath: input.filename,
    generatedAt: new Date().toISOString(),
    iterations: input.iterations,
  };
}
