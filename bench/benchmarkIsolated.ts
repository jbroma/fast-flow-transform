import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { createBenchmarkViews } from './benchmark.ts';
import type { BenchmarkCase, BenchmarkInput } from './benchmark.ts';
import type {
  BenchmarkReport,
  BenchmarkSuiteReport,
  BenchmarkViewReport,
} from './benchmarkReport.ts';

const execFileAsync = promisify(execFile);
const DEFAULT_BENCHMARK_CASES = Object.freeze<BenchmarkCase[]>([
  { caseName: 'without sourcemaps', sourcemap: false },
  { caseName: 'with sourcemaps', sourcemap: true },
]);

interface IsolatedBenchmarkRequest {
  fixturePath: string;
  iterations: number;
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
  const views: BenchmarkViewReport[] = [];

  for (const view of createBenchmarkViews(benchmarkCase.sourcemap)) {
    views.push(
      await runView({
        fixturePath: input.filename,
        iterations: input.iterations,
        sourcemap: benchmarkCase.sourcemap,
        viewName: view.viewName,
      })
    );
  }

  return {
    caseName: benchmarkCase.caseName,
    fixturePath: input.filename,
    generatedAt: new Date().toISOString(),
    iterations: input.iterations,
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
