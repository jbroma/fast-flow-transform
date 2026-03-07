'use strict';

const fs = require('fs');
const path = require('path');

const babel = require('@babel/core');

function resolveRuntimeModule(name) {
  const distPath = path.resolve(__dirname, '..', 'dist', name);
  if (fs.existsSync(`${distPath}.js`)) {
    return require(distPath);
  }
  return require(path.resolve(__dirname, '..', 'src', name));
}

const { getPool, closeAllPools } = resolveRuntimeModule('pool');
const { resolveBinaryPath } = resolveRuntimeModule('resolveBinary');

function durationMs(startNs, endNs) {
  return Number(endNs - startNs) / 1e6;
}

function average(values) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function runNativeBenchmark({ code, filename, iterations }) {
  const binaryPath = resolveBinaryPath();
  const pool = getPool(binaryPath, 1);

  const coldStart = process.hrtime.bigint();
  await pool.transform({
    filename,
    code,
    dialect: 'flow-detect',
    format: 'compact',
    reactRuntimeTarget: '18',
    enumRuntimeModule: 'flow-enums-runtime',
  });
  const coldTimeMs = durationMs(coldStart, process.hrtime.bigint());

  const warmTimes = [];
  for (let index = 0; index < iterations; index += 1) {
    const start = process.hrtime.bigint();
    await pool.transform({
      filename,
      code,
      dialect: 'flow-detect',
      format: 'compact',
      reactRuntimeTarget: '18',
      enumRuntimeModule: 'flow-enums-runtime',
    });
    warmTimes.push(durationMs(start, process.hrtime.bigint()));
  }

  return {
    coldTimeMs,
    warmAverageMs: average(warmTimes),
    warmRuns: warmTimes,
  };
}

function runBabelBenchmark({ code, filename, iterations }) {
  const transformOnce = () => {
    babel.transformSync(code, {
      filename,
      babelrc: false,
      configFile: false,
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
  const coldTimeMs = durationMs(coldStart, process.hrtime.bigint());

  const warmTimes = [];
  for (let index = 0; index < iterations; index += 1) {
    const start = process.hrtime.bigint();
    transformOnce();
    warmTimes.push(durationMs(start, process.hrtime.bigint()));
  }

  return {
    coldTimeMs,
    warmAverageMs: average(warmTimes),
    warmRuns: warmTimes,
  };
}

async function main() {
  const fixturePath = path.resolve(__dirname, 'fixtures', 'sample.js');
  const reportPath = path.resolve(__dirname, 'report.json');
  const code = fs.readFileSync(fixturePath, 'utf8');

  const iterations = Number(process.env.BENCH_ITERATIONS || 50);

  const [nativeResult, babelResult] = await Promise.all([
    runNativeBenchmark({
      code,
      filename: fixturePath,
      iterations,
    }),
    Promise.resolve(
      runBabelBenchmark({
        code,
        filename: fixturePath,
        iterations,
      })
    ),
  ]);

  closeAllPools();

  const report = {
    fixturePath,
    iterations,
    native: nativeResult,
    babel: babelResult,
    delta: {
      coldMs: nativeResult.coldTimeMs - babelResult.coldTimeMs,
      warmAverageMs: nativeResult.warmAverageMs - babelResult.warmAverageMs,
    },
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('Benchmark report written to:', reportPath);
  console.table({
    native: {
      coldMs: nativeResult.coldTimeMs.toFixed(2),
      warmAverageMs: nativeResult.warmAverageMs.toFixed(2),
    },
    babel: {
      coldMs: babelResult.coldTimeMs.toFixed(2),
      warmAverageMs: babelResult.warmAverageMs.toFixed(2),
    },
  });
}

main().catch((error) => {
  closeAllPools();
  console.error(error);
  process.exitCode = 1;
});
