const FLOW_STRIP_PLUGIN = [
  '@babel/plugin-transform-flow-strip-types',
  { allowDeclareFields: true },
] as const;

const SHARED_BABEL_OPTIONS = Object.freeze({
  babelrc: false,
  configFile: false,
  sourceMaps: false,
  sourceType: 'module',
});

interface BabelTransformOptions {
  babelrc: boolean;
  configFile: boolean;
  filename: string;
  plugins: unknown[];
  sourceMaps: boolean;
  sourceType: string;
}

export interface BenchmarkJob {
  code: string;
  filename: string;
}

export interface BenchmarkCandidate {
  name: string;
  run(job: BenchmarkJob): Promise<void>;
}

interface BabelCore {
  transformSync(code: string, options: BabelTransformOptions): unknown;
}

interface TransformModule {
  transform(input: {
    filename: string;
    source: string;
    sourcemap: boolean;
  }): Promise<{
    code: string;
  }>;
}

let babelCorePromise: Promise<BabelCore> | undefined;
let transformPromise: Promise<TransformModule['transform']> | undefined;

function ensureBabelOutput(result: unknown, candidateName: string): void {
  const code = (result as { code?: unknown } | null)?.code;

  if (typeof code !== 'string') {
    throw new TypeError(
      `Babel candidate "${candidateName}" produced no code output`
    );
  }
}

async function loadBabelCore(): Promise<BabelCore> {
  babelCorePromise ??= import('@babel/core').then((module) => module.default);
  return await babelCorePromise;
}

async function loadTransform(): Promise<TransformModule['transform']> {
  transformPromise ??= import('fast-flow-transform').then(
    (module) => module.transform
  );
  return await transformPromise;
}

function createBabelCandidate(
  createOptions: (filename: string) => BabelTransformOptions
): BenchmarkCandidate {
  return {
    name: 'babel',
    async run({ code, filename }) {
      const babelCore = await loadBabelCore();
      ensureBabelOutput(
        babelCore.transformSync(code, createOptions(filename)),
        'babel'
      );
    },
  };
}

export function createBabelOptions(filename: string): BabelTransformOptions {
  return {
    ...SHARED_BABEL_OPTIONS,
    filename,
    plugins: ['babel-plugin-syntax-hermes-parser', FLOW_STRIP_PLUGIN],
  };
}

export function createCandidates(): BenchmarkCandidate[] {
  return [
    {
      name: 'fft',
      async run({ code, filename }) {
        const transform = await loadTransform();
        const result = await transform({
          filename,
          source: code,
          sourcemap: false,
        });

        if (typeof result.code !== 'string') {
          throw new TypeError('FFT candidate produced no code output');
        }
      },
    },
    createBabelCandidate(createBabelOptions),
  ];
}
