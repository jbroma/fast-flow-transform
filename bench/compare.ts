import {
  formatSummaryTable,
  resolveBenchmarkInput,
  runBenchmarks,
  writeBenchmarkReport,
} from './benchmark.ts';

async function main(): Promise<void> {
  const input = resolveBenchmarkInput();
  const report = await runBenchmarks(input);
  const reportPath = writeBenchmarkReport(report, input.jsonPath);

  console.log(formatSummaryTable(report));

  if (reportPath) {
    console.log(`\nJSON report written to: ${reportPath}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
