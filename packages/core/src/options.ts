import type {
  Dialect,
  Format,
  LoaderOptions,
  LoaderOptionsInput,
  ReactRuntimeTarget,
} from './types.js';

const DEFAULT_OPTIONS: LoaderOptions = Object.freeze({
  dialect: 'flow-detect',
  enumRuntimeModule: 'flow-enums-runtime',
  format: 'compact',
  reactRuntimeTarget: '18',
  sourcemap: true,
  threads: undefined,
});

const DIALECTS = new Set<Dialect>(['flow', 'flow-detect', 'flow-unambiguous']);
const FORMATS = new Set<Format>(['compact', 'pretty']);
const REACT_TARGETS = new Set<ReactRuntimeTarget>(['18', '19']);

function invalidOption(optionName: string, value: unknown): Error {
  return new Error(
    `Invalid fast-flow-transform option \`${optionName}\`: ${String(value)}`
  );
}

function validateStringOption<T extends string>(
  validValues: Set<T>,
  optionName: string,
  value: string
): T {
  if (validValues.has(value as T)) {
    return value as T;
  }

  throw invalidOption(optionName, value);
}

function validateThreads(threads: number | undefined): void {
  if (threads === undefined) {
    return;
  }

  if (Number.isInteger(threads) && threads > 0) {
    return;
  }

  throw invalidOption('threads', threads);
}

function validateEnumRuntimeModule(enumRuntimeModule: unknown): string {
  if (typeof enumRuntimeModule === 'string' && enumRuntimeModule.length > 0) {
    return enumRuntimeModule;
  }

  throw new Error(
    'Invalid fast-flow-transform option `enumRuntimeModule`: expected non-empty string'
  );
}

function validateSourceMaps(sourcemap: unknown): true {
  if (sourcemap === true) {
    return true;
  }

  throw new Error(
    'fast-flow-transform requires `sourcemap: true`; source maps are always emitted'
  );
}

function normalizeOptions(options: LoaderOptionsInput): LoaderOptions {
  const dialect = validateStringOption(
    DIALECTS,
    'dialect',
    options.dialect ?? DEFAULT_OPTIONS.dialect
  );
  const format = validateStringOption(
    FORMATS,
    'format',
    options.format ?? DEFAULT_OPTIONS.format
  );
  const reactRuntimeTarget = validateStringOption(
    REACT_TARGETS,
    'reactRuntimeTarget',
    String(options.reactRuntimeTarget ?? DEFAULT_OPTIONS.reactRuntimeTarget)
  );
  const enumRuntimeModule = validateEnumRuntimeModule(
    options.enumRuntimeModule ?? DEFAULT_OPTIONS.enumRuntimeModule
  );
  const sourcemap = validateSourceMaps(
    options.sourcemap ?? DEFAULT_OPTIONS.sourcemap
  );

  validateThreads(options.threads);

  return {
    dialect,
    enumRuntimeModule,
    format,
    reactRuntimeTarget,
    sourcemap,
    threads: options.threads,
  };
}

export function parseOptions(
  rawOptions: LoaderOptionsInput | null | undefined
) {
  return normalizeOptions(rawOptions ?? {});
}

export function stableOptionsKey(options: LoaderOptions): string {
  return JSON.stringify(options);
}
