import type {
  Dialect,
  Format,
  ReactRuntimeTarget,
  TransformOptions,
  TransformOptionsInput,
} from './types.js';

const DEFAULT_OPTIONS: TransformOptions = Object.freeze({
  dialect: 'flow-detect',
  enumRuntimeModule: 'flow-enums-runtime',
  format: 'pretty',
  preserveComments: false,
  preserveWhitespace: false,
  reactRuntimeTarget: '18',
  sourcemap: true,
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

function validateEnumRuntimeModule(enumRuntimeModule: unknown): string {
  if (typeof enumRuntimeModule === 'string' && enumRuntimeModule.length > 0) {
    return enumRuntimeModule;
  }

  throw new Error(
    'Invalid fast-flow-transform option `enumRuntimeModule`: expected non-empty string'
  );
}

function validateSourceMapOption(sourcemap: unknown): boolean {
  if (typeof sourcemap === 'boolean') {
    return sourcemap;
  }

  throw invalidOption('sourcemap', sourcemap);
}

function validateBooleanOption(optionName: string, value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  throw invalidOption(optionName, value);
}

export function parseOptions(
  rawOptions: TransformOptionsInput | null | undefined
): TransformOptions {
  const options = rawOptions ?? {};
  const preserveWhitespace = validateBooleanOption(
    'preserveWhitespace',
    options.preserveWhitespace ?? DEFAULT_OPTIONS.preserveWhitespace
  );
  const preserveComments = validateBooleanOption(
    'preserveComments',
    options.preserveComments ?? DEFAULT_OPTIONS.preserveComments
  );

  const sourcemap =
    preserveWhitespace && options.sourcemap === undefined
      ? false
      : validateSourceMapOption(options.sourcemap ?? DEFAULT_OPTIONS.sourcemap);

  if (preserveWhitespace && sourcemap) {
    throw new Error(
      'Invalid fast-flow-transform option `sourcemap`: preserveWhitespace does not support sourcemaps yet'
    );
  }

  return {
    dialect: validateStringOption(
      DIALECTS,
      'dialect',
      options.dialect ?? DEFAULT_OPTIONS.dialect
    ),
    enumRuntimeModule: validateEnumRuntimeModule(
      options.enumRuntimeModule ?? DEFAULT_OPTIONS.enumRuntimeModule
    ),
    format: validateStringOption(
      FORMATS,
      'format',
      options.format ?? DEFAULT_OPTIONS.format
    ),
    preserveComments,
    preserveWhitespace,
    reactRuntimeTarget: validateStringOption(
      REACT_TARGETS,
      'reactRuntimeTarget',
      String(options.reactRuntimeTarget ?? DEFAULT_OPTIONS.reactRuntimeTarget)
    ),
    sourcemap,
  };
}
