export interface BenchmarkCase {
  caseName: string;
  format: 'compact' | 'pretty';
  preserveComments: boolean;
  preserveWhitespace: boolean;
  sourcemap: boolean;
}

export function benchmarkCaseName(
  format: 'compact' | 'pretty',
  sourcemap: boolean,
  options: {
    preserveComments?: boolean;
    preserveWhitespace?: boolean;
  } = {}
): string {
  if (options.preserveWhitespace) {
    return options.preserveComments
      ? 'preserve whitespace with comments'
      : 'preserve whitespace without comments';
  }

  return `${format} ${sourcemap ? 'with sourcemaps' : 'without sourcemaps'}`;
}

export const DEFAULT_BENCHMARK_CASES = Object.freeze<BenchmarkCase[]>([
  {
    caseName: benchmarkCaseName('compact', false),
    format: 'compact',
    preserveComments: false,
    preserveWhitespace: false,
    sourcemap: false,
  },
  {
    caseName: benchmarkCaseName('pretty', false),
    format: 'pretty',
    preserveComments: false,
    preserveWhitespace: false,
    sourcemap: false,
  },
  {
    caseName: benchmarkCaseName('compact', true),
    format: 'compact',
    preserveComments: false,
    preserveWhitespace: false,
    sourcemap: true,
  },
  {
    caseName: benchmarkCaseName('pretty', true),
    format: 'pretty',
    preserveComments: false,
    preserveWhitespace: false,
    sourcemap: true,
  },
  // {
  //   caseName: benchmarkCaseName('pretty', false, {
  //     preserveComments: false,
  //     preserveWhitespace: true,
  //   }),
  //   format: 'pretty',
  //   preserveComments: false,
  //   preserveWhitespace: true,
  //   sourcemap: false,
  // },
  // {
  //   caseName: benchmarkCaseName('pretty', false, {
  //     preserveComments: true,
  //     preserveWhitespace: true,
  //   }),
  //   format: 'pretty',
  //   preserveComments: true,
  //   preserveWhitespace: true,
  //   sourcemap: false,
  // },
]);
