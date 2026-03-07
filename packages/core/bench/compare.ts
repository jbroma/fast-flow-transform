import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import babel from '@babel/core';

import { closeAllPools, getPool } from '../src/pool.js';
import { resolveBinaryPath } from '../src/resolveBinary.js';

type BenchmarkResult = {
  coldTimeMs: number;
  warmAverageMs: number;
  warmRuns: number[];
};

function durationMs(startNs: bigint, endNs: bigint): number {
  return Number(endNs - startNs) / 1e6;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function runNativeBenchmark(input: {
  code: string;
  filename: string;
  iterations: number;
}): Promise<BenchmarkResult> {
  const binaryPath = resolveBinaryPath();
  const pool = getPool(binaryPath, 1);

  const transform = () => {
    return pool.transform({
      code: input.code,
      dialect: 'flow-detect',
      enumRuntimeModule: 'flow-enums-runtime',
      filename: input.filename,
      format: 'compact',
      reactRuntimeTarget: '18',
    });
  };

  const coldStart = process.hrtime.bigint();
  await transform();
  const warmRuns: number[] = [];

  for (let index = 0; index < input.iterations; index += 1) {
    const start = process.hrtime.bigint();
    await transform();
    warmRuns.push(durationMs(start, process.hrtime.bigint()));
  }

  return {
    coldTimeMs: durationMs(coldStart, process.hrtime.bigint()),
    warmAverageMs: average(warmRuns),
    warmRuns,
  };
}

function runBabelBenchmark(input: {
  code: string;
  filename: string;
  iterations: number;
}): BenchmarkResult {
  const transformOnce = () => {
    babel.transformSync(input.code, {
      babelrc: false,
      configFile: false,
      filename: input.filename,
      plugins: [
        ['@babel/plugin-syntax-flow', { enums: true }],
        [
          '@babel/plugin-transform-flow-strip-types',
          { allowDeclareFields: true },
        ],
        'babel-plugin-transform-flow-enums',
      ],
      sourceMaps: true,
      sourceType: 'unambiguous',
    });
  };

  const coldStart = process.hrtime.bigint();
  transformOnce();
  const warmRuns: number[] = [];

  for (let index = 0; index < input.iterations; index += 1) {
    const start = process.hrtime.bigint();
    transformOnce();
    warmRuns.push(durationMs(start, process.hrtime.bigint()));
  }

  return {
    coldTimeMs: durationMs(coldStart, process.hrtime.bigint()),
    warmAverageMs: average(warmRuns),
    warmRuns,
  };
}

async function main(): Promise<void> {
  const benchDirectory = fileURLToPath(new URL('.', import.meta.url));
  const fixturePath = resolve(benchDirectory, 'fixtures', 'sample.js');
  const reportPath = resolve(benchDirectory, 'report.json');
  const code = readFileSync(fixturePath, 'utf8');
  const iterations = Number(process.env.BENCH_ITERATIONS ?? 50);

  try {
    const [nativeResult, babelResult] = await Promise.all([
      runNativeBenchmark({ code, filename: fixturePath, iterations }),
      Promise.resolve(
        runBabelBenchmark({ code, filename: fixturePath, iterations })
      ),
    ]);

    writeFileSync(
      reportPath,
      JSON.stringify(
        {
          babel: babelResult,
          delta: {
            coldMs: nativeResult.coldTimeMs - babelResult.coldTimeMs,
            warmAverageMs:
              nativeResult.warmAverageMs - babelResult.warmAverageMs,
          },
          fixturePath,
          iterations,
          native: nativeResult,
        },
        null,
        2
      )
    );

    console.log('Benchmark report written to:', reportPath);
    console.table({
      babel: {
        coldMs: babelResult.coldTimeMs.toFixed(2),
        warmAverageMs: babelResult.warmAverageMs.toFixed(2),
      },
      native: {
        coldMs: nativeResult.coldTimeMs.toFixed(2),
        warmAverageMs: nativeResult.warmAverageMs.toFixed(2),
      },
    });
  } finally {
    closeAllPools();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
