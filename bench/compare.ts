import {
  formatSuiteSummary,
  resolveBenchmarkInput,
  writeBenchmarkReport,
} from './benchmark.ts';
import { runBenchmarkCasesIsolated } from './benchmarkIsolated.ts';

async function main(): Promise<void> {
  const input = resolveBenchmarkInput();
  const report = await runBenchmarkCasesIsolated(input);
  const reportPath = writeBenchmarkReport(report, input.jsonPath);

  console.log(formatSuiteSummary(report));

  if (reportPath) {
    console.log(`\nJSON report written to: ${reportPath}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
