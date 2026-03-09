import { readFileSync } from 'node:fs';

import { createBenchmarkViews, runBenchmarkView } from './benchmark.ts';

interface ProcessRequest {
  fixturePath: string;
  format: 'compact' | 'pretty';
  iterations: number;
  preserveComments: boolean;
  preserveWhitespace: boolean;
  sourcemap: boolean;
  viewName: string;
}

function parseRequest(raw: string | undefined): ProcessRequest {
  if (!raw) {
    throw new Error('Missing isolated benchmark view request payload');
  }

  return JSON.parse(raw) as ProcessRequest;
}

function viewInput(request: ProcessRequest) {
  return {
    code: readFileSync(request.fixturePath, 'utf8'),
    filename: request.fixturePath,
    iterations: request.iterations,
  };
}

function resolveView(request: ProcessRequest) {
  const view = createBenchmarkViews(
    request.sourcemap,
    request.format,
    request.preserveWhitespace,
    request.preserveComments
  ).find((candidateView) => candidateView.viewName === request.viewName);

  if (!view) {
    throw new Error(`Unknown benchmark view: ${request.viewName}`);
  }

  return view;
}

async function main(): Promise<void> {
  const request = parseRequest(process.argv[2]);
  const input = viewInput(request);
  const view = resolveView(request);
  const report = await runBenchmarkView(input, view, () =>
    process.hrtime.bigint()
  );

  process.stdout.write(JSON.stringify(report));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
